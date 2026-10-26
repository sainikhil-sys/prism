import "server-only";
import { DEFAULT_PARAMS } from "@/lib/ml/gbdt";
import type { Granularity } from "@/lib/ml/features";
import { InsufficientDataError, runForecast, type ForecastResult } from "@/lib/ml/forecast";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext } from "../context";
import { db } from "../db";
import { loadProductSeries } from "./series";

export const ALGORITHM = "gbdt-poisson-treeshap";

function json(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "number" && !Number.isFinite(val) ? null : val)));
}

export function trainForProduct(periods: Parameters<typeof runForecast>[0]["periods"], granularity: Granularity, horizon: number, futurePrice: number): ForecastResult {
  try {
    return runForecast({ periods, granularity, horizon, futurePrice, asOf: new Date() });
  } catch (e) {
    if (e instanceof InsufficientDataError) throw new UserError(e.message);
    throw e;
  }
}

/** Persists a trained model as the next version for the product. */
export async function saveModelVersion(tx: Prisma.TransactionClient, ctx: OrgContext, productId: string, res: ForecastResult) {
  const last = await tx.modelVersion.findFirst({ where: { productId }, orderBy: { version: "desc" }, select: { version: true } });
  return tx.modelVersion.create({
    data: {
      organizationId: ctx.orgId,
      productId,
      version: (last?.version ?? 0) + 1,
      algorithm: ALGORITHM,
      granularity: res.granularity,
      params: json({ ...DEFAULT_PARAMS, monotone: "price features decreasing" }),
      featureNames: json(res.final.model.featureNames),
      artifact: json({ model: res.final.model, config: res.final.config, priceStats: res.final.priceStats }),
      trainedFrom: res.final.trainedFrom,
      trainedTo: res.final.trainedTo,
      trainRows: res.final.trainRows,
      metrics: json(res.metrics),
      baselineMetrics: json(res.baselineMetrics),
      dataQuality: json({ ...res.dataQuality, holdoutLength: res.holdoutLength }),
      createdById: ctx.user.id,
    },
  });
}

export async function saveForecast(tx: Prisma.TransactionClient, ctx: OrgContext, productId: string, modelVersionId: string, res: ForecastResult) {
  return tx.forecast.create({
    data: {
      organizationId: ctx.orgId,
      productId,
      modelVersionId,
      granularity: res.granularity,
      horizon: res.horizon,
      warnings: json(res.warnings),
      createdById: ctx.user.id,
      points: {
        create: [
          ...res.backtest.map((b) => ({ kind: "BACKTEST" as const, periodKey: b.key, predicted: b.forecast, baseline: b.baseline, actual: b.actual })),
          ...res.future.map((f) => ({ kind: "FUTURE" as const, periodKey: f.key, predicted: f.mean, lower: f.lower, upper: f.upper, price: f.price })),
        ],
      },
    },
  });
}

export async function runProductForecast(ctx: OrgContext, productId: string, granularity: Granularity, horizon: number) {
  const { product, periods } = await loadProductSeries(ctx, productId, granularity);
  if (periods.length === 0) throw new UserError("This product has no sales history yet. Import sales first.");
  const res = trainForProduct(periods, granularity, horizon, product.currentPrice.toNumber());
  return db().$transaction(
    async (tx) => {
      const mv = await saveModelVersion(tx, ctx, product.id, res);
      const fc = await saveForecast(tx, ctx, product.id, mv.id, res);
      await audit(tx, {
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: "forecast.generated",
        entityType: "Forecast",
        entityId: fc.id,
        metadata: { productId: product.id, sku: product.sku, modelVersion: mv.version, granularity, horizon },
      });
      return { forecastId: fc.id, modelVersion: mv.version };
    },
    { timeout: 30_000 },
  );
}

export async function getLatestForecast(ctx: OrgContext, productId: string) {
  return db().forecast.findFirst({
    where: { organizationId: ctx.orgId, productId },
    orderBy: { createdAt: "desc" },
    include: {
      points: { orderBy: { periodKey: "asc" } },
      modelVersion: {
        select: { id: true, version: true, algorithm: true, trainedFrom: true, trainedTo: true, trainRows: true, metrics: true, baselineMetrics: true, dataQuality: true, createdAt: true },
      },
    },
  });
}

export async function listForecastSummaries(ctx: OrgContext) {
  const products = await db().product.findMany({
    where: { organizationId: ctx.orgId, active: true },
    select: {
      id: true,
      sku: true,
      name: true,
      _count: { select: { sales: true } },
      forecasts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true, granularity: true, horizon: true, modelVersion: { select: { version: true, metrics: true, baselineMetrics: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return products;
}

export async function listModelVersions(ctx: OrgContext, productId?: string) {
  return db().modelVersion.findMany({
    where: { organizationId: ctx.orgId, ...(productId ? { productId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      version: true,
      algorithm: true,
      granularity: true,
      trainedFrom: true,
      trainedTo: true,
      trainRows: true,
      metrics: true,
      baselineMetrics: true,
      createdAt: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  });
}
