import "server-only";
import { competitorPriceSchema, type CompetitorPriceInput } from "@/lib/validation";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext } from "../context";
import { db } from "../db";

export async function addCompetitorPrice(ctx: OrgContext, input: CompetitorPriceInput) {
  const d = competitorPriceSchema.parse(input);
  const product = await db().product.findFirst({ where: { id: d.productId, organizationId: ctx.orgId }, select: { id: true, sku: true } });
  if (!product) throw new UserError("Product not found.", { productId: "Choose a product" });
  const dup = await db().competitorPrice.findFirst({
    where: { organizationId: ctx.orgId, productId: product.id, competitor: d.competitor, observedAt: d.observedAt },
  });
  if (dup) throw new UserError("An observation for this competitor at this time already exists.");
  return db().$transaction(async (tx) => {
    const row = await tx.competitorPrice.create({
      data: {
        organizationId: ctx.orgId,
        productId: product.id,
        competitor: d.competitor,
        price: d.price,
        observedAt: d.observedAt,
        source: "MANUAL",
        sourceUrl: d.sourceUrl,
        notes: d.notes,
        createdById: ctx.user.id,
      },
    });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "competitor_price.added", entityType: "CompetitorPrice", entityId: row.id, metadata: { sku: product.sku, competitor: d.competitor, price: d.price } });
    return row;
  });
}

export async function deleteCompetitorPrice(ctx: OrgContext, id: string) {
  return db().$transaction(async (tx) => {
    const row = await tx.competitorPrice.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!row) throw new UserError("Observation not found.");
    await tx.competitorPrice.delete({ where: { id: row.id } });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.user.id, action: "competitor_price.deleted", entityType: "CompetitorPrice", entityId: row.id });
  });
}

export async function listCompetitorPrices(ctx: OrgContext, productId?: string, take = 200) {
  return db().competitorPrice.findMany({
    where: { organizationId: ctx.orgId, ...(productId ? { productId } : {}) },
    orderBy: { observedAt: "desc" },
    take,
    include: { product: { select: { id: true, sku: true, name: true, currentPrice: true } } },
  });
}

/** Latest observation per competitor for each product, compared with our current price. */
export async function competitorComparison(ctx: OrgContext) {
  const rows = await db().$queryRaw<
    { productId: string; sku: string; name: string; ourPrice: string; competitor: string; price: string; observedAt: Date }[]
  >`
    SELECT DISTINCT ON (c."productId", c."competitor")
      c."productId", p."sku", p."name", p."currentPrice"::text AS "ourPrice",
      c."competitor", c."price"::text AS "price", c."observedAt"
    FROM "CompetitorPrice" c
    JOIN "Product" p ON p."id" = c."productId" AND p."organizationId" = c."organizationId"
    WHERE c."organizationId" = ${ctx.orgId}
    ORDER BY c."productId", c."competitor", c."observedAt" DESC`;
  return rows.map((r) => ({ ...r, ourPrice: Number(r.ourPrice), price: Number(r.price) }));
}
