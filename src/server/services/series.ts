import "server-only";
import { buildSeries, type Granularity, type Period } from "@/lib/ml/features";
import type { Product } from "@/generated/prisma/client";
import { UserError } from "../action-result";
import type { OrgContext } from "../context";
import { db } from "../db";

export function num(v: { toNumber(): number } | null | undefined): number | null {
  return v === null || v === undefined ? null : v.toNumber();
}

export async function loadProductSeries(
  ctx: OrgContext,
  productId: string,
  granularity: Granularity,
): Promise<{ product: Product; periods: Period[]; salesCount: number; competitorCount: number }> {
  const product = await db().product.findFirst({ where: { id: productId, organizationId: ctx.orgId } });
  if (!product) throw new UserError("Product not found.");
  const [sales, competitor] = await Promise.all([
    db().salesRecord.findMany({
      where: { organizationId: ctx.orgId, productId },
      select: { soldAt: true, quantity: true, unitPrice: true, promotion: true },
      orderBy: { soldAt: "asc" },
    }),
    db().competitorPrice.findMany({
      where: { organizationId: ctx.orgId, productId },
      select: { observedAt: true, price: true },
      orderBy: { observedAt: "asc" },
    }),
  ]);
  const periods = buildSeries(
    sales.map((s) => ({ date: s.soldAt, quantity: s.quantity, unitPrice: s.unitPrice.toNumber(), promotion: s.promotion })),
    competitor.map((c) => ({ observedAt: c.observedAt, price: c.price.toNumber() })),
    granularity,
    { listPrice: product.currentPrice.toNumber() },
  );
  return { product, periods, salesCount: sales.length, competitorCount: competitor.length };
}
