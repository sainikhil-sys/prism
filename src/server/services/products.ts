import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { productSchema, type ProductInput } from "@/lib/validation";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext } from "../context";
import { db } from "../db";

export const productListQuery = z.object({
  q: z.string().trim().max(100).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  stock: z.enum(["all", "low", "out", "untracked"]).optional().default("all"),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
  sort: z.enum(["name", "sku", "currentPrice", "inventoryQty", "updatedAt"]).optional().default("name"),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(25),
});

export type ProductListQuery = z.output<typeof productListQuery>;

export async function listProducts(ctx: OrgContext, query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = { organizationId: ctx.orgId };
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { sku: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.category) where.category = query.category;
  if (query.status !== "all") where.active = query.status === "active";
  if (query.stock === "out") where.inventoryQty = { lte: 0 };
  if (query.stock === "untracked") where.inventoryQty = null;

  // "Low stock" compares two columns, which Prisma filters cannot express, so the matching ids
  // are selected with a parameterized query scoped to this organization.
  if (query.stock === "low") {
    const rows = await db().$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Product"
      WHERE "organizationId" = ${ctx.orgId} AND "inventoryQty" IS NOT NULL
        AND "reorderPoint" IS NOT NULL AND "inventoryQty" <= "reorderPoint"`;
    where.id = { in: rows.map((r) => r.id) };
  }

  const [items, total, categories] = await Promise.all([
    db().product.findMany({
      where,
      // Only nullable columns accept a nulls ordering.
      orderBy: [query.sort === "inventoryQty" ? { inventoryQty: { sort: query.dir, nulls: "last" } } : { [query.sort]: query.dir }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db().product.count({ where }),
    db().product.findMany({
      where: { organizationId: ctx.orgId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  return {
    items,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    categories: categories.map((c) => c.category!).filter(Boolean),
  };
}

export async function getProduct(ctx: OrgContext, id: string) {
  return db().product.findFirst({ where: { id, organizationId: ctx.orgId } });
}

export async function listProductOptions(ctx: OrgContext) {
  return db().product.findMany({
    where: { organizationId: ctx.orgId },
    select: { id: true, sku: true, name: true },
    orderBy: { name: "asc" },
  });
}

function toData(p: z.output<typeof productSchema>) {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category,
    costPrice: p.costPrice,
    currentPrice: p.currentPrice,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    inventoryQty: p.inventoryQty,
    reorderPoint: p.reorderPoint,
    leadTimeDays: p.leadTimeDays,
    active: p.active,
  };
}

export async function createProduct(ctx: OrgContext, input: ProductInput) {
  const p = productSchema.parse(input);
  const exists = await db().product.findUnique({ where: { organizationId_sku: { organizationId: ctx.orgId, sku: p.sku } } });
  if (exists) throw new UserError("A product with this SKU already exists.", { sku: "This SKU is already in use" });
  return db().$transaction(async (tx) => {
    const product = await tx.product.create({ data: { organizationId: ctx.orgId, ...toData(p) } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "product.created", entityType: "Product", entityId: product.id, metadata: { sku: p.sku } });
    return product;
  });
}

export async function updateProduct(ctx: OrgContext, id: string, input: ProductInput) {
  const p = productSchema.parse(input);
  return db().$transaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!current) throw new UserError("Product not found.");
    if (p.sku !== current.sku) {
      const clash = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: ctx.orgId, sku: p.sku } } });
      if (clash) throw new UserError("A product with this SKU already exists.", { sku: "This SKU is already in use" });
    }
    const product = await tx.product.update({ where: { id: current.id }, data: toData(p) });
    if (!current.currentPrice.equals(product.currentPrice)) {
      await tx.priceChange.create({
        data: {
          organizationId: ctx.orgId,
          productId: product.id,
          oldPrice: current.currentPrice,
          newPrice: product.currentPrice,
          changedById: ctx.user.id,
          reason: "Manual edit",
        },
      });
    }
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "product.updated", entityType: "Product", entityId: product.id, metadata: { sku: p.sku } });
    return product;
  });
}

export async function deleteProduct(ctx: OrgContext, id: string) {
  return db().$transaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, sku: true } });
    if (!current) throw new UserError("Product not found.");
    await tx.product.delete({ where: { id: current.id } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "product.deleted", entityType: "Product", entityId: current.id, metadata: { sku: current.sku } });
  });
}
