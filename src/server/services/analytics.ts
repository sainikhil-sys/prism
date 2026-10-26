import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { OrgContext } from "../context";
import { db } from "../db";

export const rangeQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  productId: z.string().optional(),
});

export interface DateRange {
  from: Date;
  /** Exclusive end. */
  to: Date;
  fromKey: string;
  toKey: string;
}

/** Defaults to the 90 days ending at the latest sale, so stale data still shows something useful. */
export async function resolveRange(ctx: OrgContext, q: z.output<typeof rangeQuery>): Promise<DateRange | null> {
  let toKey = q.to;
  if (!toKey) {
    const latest = await db().salesRecord.findFirst({ where: { organizationId: ctx.orgId }, orderBy: { soldAt: "desc" }, select: { soldAt: true } });
    if (!latest) return null;
    toKey = latest.soldAt.toISOString().slice(0, 10);
  }
  const to = new Date(`${toKey}T00:00:00Z`);
  const fromKey = q.from ?? new Date(to.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
  const from = new Date(`${fromKey}T00:00:00Z`);
  if (from > to) return { from: to, to: new Date(from.getTime() + 86_400_000), fromKey: toKey, toKey: fromKey };
  return { from, to: new Date(to.getTime() + 86_400_000), fromKey, toKey };
}

export async function salesOverview(ctx: OrgContext, range: DateRange, productId?: string) {
  const pid = productId ?? null;
  // Margin uses each product's current cost price because historical cost is not recorded.
  const daily = await db().$queryRaw<{ day: Date; units: bigint; revenue: string; margin: string }[]>`
    SELECT date_trunc('day', s."soldAt") AS day,
      SUM(s."quantity")::bigint AS units,
      SUM(s."quantity" * s."unitPrice")::text AS revenue,
      SUM(s."quantity" * (s."unitPrice" - p."costPrice"))::text AS margin
    FROM "SalesRecord" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."organizationId" = ${ctx.orgId} AND s."soldAt" >= ${range.from} AND s."soldAt" < ${range.to}
      AND (${pid}::text IS NULL OR s."productId" = ${pid})
    GROUP BY 1 ORDER BY 1`;
  const top = await db().$queryRaw<{ productId: string; sku: string; name: string; units: bigint; revenue: string; margin: string }[]>`
    SELECT p."id" AS "productId", p."sku", p."name",
      SUM(s."quantity")::bigint AS units,
      SUM(s."quantity" * s."unitPrice")::text AS revenue,
      SUM(s."quantity" * (s."unitPrice" - p."costPrice"))::text AS margin
    FROM "SalesRecord" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."organizationId" = ${ctx.orgId} AND s."soldAt" >= ${range.from} AND s."soldAt" < ${range.to}
      AND (${pid}::text IS NULL OR s."productId" = ${pid})
    GROUP BY p."id", p."sku", p."name" ORDER BY SUM(s."quantity" * s."unitPrice") DESC LIMIT 10`;

  const series = daily.map((d) => ({
    day: d.day.toISOString().slice(0, 10),
    units: Number(d.units),
    revenue: Number(d.revenue),
    margin: Number(d.margin),
  }));
  const totals = series.reduce((a, d) => ({ units: a.units + d.units, revenue: a.revenue + d.revenue, margin: a.margin + d.margin }), { units: 0, revenue: 0, margin: 0 });
  return {
    series,
    totals,
    marginRate: totals.revenue > 0 ? totals.margin / totals.revenue : null,
    top: top.map((t) => ({ ...t, units: Number(t.units), revenue: Number(t.revenue), margin: Number(t.margin) })),
  };
}

export async function inventorySnapshot(ctx: OrgContext) {
  const products = await db().product.findMany({
    where: { organizationId: ctx.orgId, active: true },
    select: { id: true, sku: true, name: true, inventoryQty: true, reorderPoint: true, leadTimeDays: true },
    orderBy: { name: "asc" },
  });
  return {
    tracked: products.filter((p) => p.inventoryQty !== null).length,
    untracked: products.filter((p) => p.inventoryQty === null).length,
    out: products.filter((p) => p.inventoryQty !== null && p.inventoryQty <= 0),
    low: products.filter((p) => p.inventoryQty !== null && p.inventoryQty > 0 && p.reorderPoint !== null && p.inventoryQty <= p.reorderPoint),
    products,
  };
}

interface Metrics {
  mae: number;
  wape: number | null;
  mase: number | null;
  n: number;
}

export async function forecastAccuracy(ctx: OrgContext) {
  const latest = await db().$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON ("productId") "id" FROM "ModelVersion"
    WHERE "organizationId" = ${ctx.orgId} ORDER BY "productId", "createdAt" DESC`;
  const versions = await db().modelVersion.findMany({
    where: { id: { in: latest.map((l) => l.id) }, organizationId: ctx.orgId },
    select: { id: true, version: true, createdAt: true, metrics: true, baselineMetrics: true, product: { select: { id: true, sku: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return versions.map((v) => ({
    ...v,
    metrics: v.metrics as unknown as Metrics,
    baselineMetrics: v.baselineMetrics as unknown as Metrics,
  }));
}

/**
 * Observed sales before and after each approved price change. This is a descriptive comparison:
 * seasonality, promotions and other changes also affect the "after" window.
 */
export async function recommendationOutcomes(ctx: OrgContext, windowDays = 14) {
  const changes = await db().priceChange.findMany({
    where: { organizationId: ctx.orgId, recommendationId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { product: { select: { id: true, sku: true, name: true } }, recommendation: { select: { id: true, best: true, baseline: true } } },
  });
  const now = Date.now();
  const out = [];
  for (const c of changes) {
    const at = c.createdAt.getTime();
    const before = new Date(at - windowDays * 86_400_000);
    const after = new Date(at + windowDays * 86_400_000);
    const window = async (gte: Date, lt: Date) => {
      const agg = await db().salesRecord.aggregate({
        where: { organizationId: ctx.orgId, productId: c.productId, soldAt: { gte, lt } },
        _sum: { quantity: true },
      });
      const revenue = await db().$queryRaw<{ r: string | null }[]>`
        SELECT SUM("quantity" * "unitPrice")::text AS r FROM "SalesRecord"
        WHERE "organizationId" = ${ctx.orgId} AND "productId" = ${c.productId} AND "soldAt" >= ${gte} AND "soldAt" < ${lt}`;
      return { units: agg._sum.quantity ?? 0, revenue: Number(revenue[0]?.r ?? 0) };
    };
    const pre = await window(before, c.createdAt);
    const complete = now >= after.getTime();
    const post = await window(c.createdAt, new Date(Math.min(after.getTime(), now)));
    const best = c.recommendation?.best as Prisma.JsonObject | null;
    out.push({
      id: c.id,
      product: c.product,
      changedAt: c.createdAt,
      oldPrice: c.oldPrice.toNumber(),
      newPrice: c.newPrice.toNumber(),
      before: pre,
      after: post,
      afterWindowComplete: complete,
      estimatedUnits: best && typeof best.expectedUnits === "number" ? best.expectedUnits : null,
    });
  }
  return out;
}

export async function listSales(ctx: OrgContext, opts: { productId?: string; page: number; pageSize: number }) {
  const where: Prisma.SalesRecordWhereInput = { organizationId: ctx.orgId, ...(opts.productId ? { productId: opts.productId } : {}) };
  const [items, total] = await Promise.all([
    db().salesRecord.findMany({
      where,
      orderBy: [{ soldAt: "desc" }, { id: "asc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { product: { select: { sku: true, name: true } } },
    }),
    db().salesRecord.count({ where }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / opts.pageSize)) };
}

export async function listAuditLog(ctx: OrgContext, opts: { page: number; pageSize: number; entityType?: string }) {
  const where: Prisma.AuditLogWhereInput = { organizationId: ctx.orgId, ...(opts.entityType ? { entityType: opts.entityType } : {}) };
  const [items, total] = await Promise.all([
    db().auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
    db().auditLog.count({ where }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / opts.pageSize)) };
}
