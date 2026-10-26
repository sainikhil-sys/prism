import "server-only";
import { optimizePrice, type PricingPolicy } from "@/lib/ml/pricing";
import type { Prisma, RecommendationStatus } from "@/generated/prisma/client";
import { UserError } from "../action-result";
import { audit } from "../audit";
import type { OrgContext } from "../context";
import { db } from "../db";
import { saveForecast, saveModelVersion, trainForProduct } from "./forecasts";
import { getPricingPolicy } from "./organizations";
import { loadProductSeries, num } from "./series";

function json(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "number" && !Number.isFinite(val) ? null : val)));
}

export async function generateRecommendation(ctx: OrgContext, productId: string) {
  const policyRow = await getPricingPolicy(ctx.orgId);
  const { product, periods } = await loadProductSeries(ctx, productId, policyRow.granularity);
  if (periods.length === 0) throw new UserError("This product has no sales history yet. Import sales first.");

  const policy: PricingPolicy = {
    objective: policyRow.objective,
    minMarginPct: policyRow.minMarginPct.toNumber(),
    maxChangePct: policyRow.maxChangePct.toNumber(),
    decisionHorizon: policyRow.decisionHorizon,
    respectInventory: policyRow.respectInventory,
    priceRangeExpansionPct: policyRow.priceRangeExpansionPct.toNumber(),
    holdThresholdPct: policyRow.holdThresholdPct.toNumber(),
    candidateCount: 25,
  };
  const productInput = {
    costPrice: product.costPrice.toNumber(),
    currentPrice: product.currentPrice.toNumber(),
    inventoryQty: product.inventoryQty,
    minPrice: num(product.minPrice),
    maxPrice: num(product.maxPrice),
  };

  const res = trainForProduct(periods, policyRow.granularity, policyRow.forecastHorizon, productInput.currentPrice);
  const result = optimizePrice(res.final, periods, productInput, policy);
  const actionable = result.status === "RECOMMENDED" || result.status === "HOLD";
  const status: RecommendationStatus = actionable ? "PENDING" : "NO_RECOMMENDATION";

  return db().$transaction(
    async (tx) => {
      const mv = await saveModelVersion(tx, ctx, product.id, res);
      await saveForecast(tx, ctx, product.id, mv.id, res);
      if (actionable) {
        await tx.priceRecommendation.updateMany({
          where: { organizationId: ctx.orgId, productId: product.id, status: "PENDING" },
          data: { status: "SUPERSEDED" },
        });
      }
      const rec = await tx.priceRecommendation.create({
        data: {
          organizationId: ctx.orgId,
          productId: product.id,
          modelVersionId: mv.id,
          status,
          outcome: result.status,
          message: result.message,
          objective: policy.objective,
          currentPrice: productInput.currentPrice,
          recommendedPrice: result.recommendedPrice,
          costPrice: productInput.costPrice,
          baseline: json(result.baseline),
          best: result.best ? json(result.best) : undefined,
          candidates: json(result.candidates),
          bounds: json({ lower: result.lower, upper: result.upper }),
          bindingConstraints: json(result.bindingConstraints),
          explanation: result.explanation ? json(result.explanation) : undefined,
          assumptions: json(result.assumptions),
          inputSnapshot: json({
            product: { sku: product.sku, ...productInput },
            policy,
            granularity: policyRow.granularity,
            dataQuality: res.dataQuality,
            warnings: res.warnings,
            modelVersion: mv.version,
            backtest: { metrics: res.metrics, baselineMetrics: res.baselineMetrics },
          }),
          createdById: ctx.user.id,
        },
      });
      await audit(tx, {
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: "recommendation.generated",
        entityType: "PriceRecommendation",
        entityId: rec.id,
        metadata: { sku: product.sku, outcome: result.status, currentPrice: productInput.currentPrice, recommendedPrice: result.recommendedPrice, modelVersion: mv.version },
      });
      return rec;
    },
    { timeout: 30_000 },
  );
}

export async function decideRecommendation(ctx: OrgContext, id: string, decision: "APPROVED" | "REJECTED", note: string | null) {
  return db().$transaction(async (tx) => {
    const rec = await tx.priceRecommendation.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!rec) throw new UserError("Recommendation not found.");
    if (rec.status !== "PENDING") throw new UserError(`This recommendation is already ${rec.status.toLowerCase().replace("_", " ")}.`);

    const product = await tx.product.findFirst({ where: { id: rec.productId, organizationId: ctx.orgId } });
    if (!product) throw new UserError("The product no longer exists.");
    const changesPrice = decision === "APPROVED" && rec.recommendedPrice !== null && !rec.recommendedPrice.equals(rec.currentPrice);
    if (changesPrice && !product.currentPrice.equals(rec.currentPrice)) {
      throw new UserError("The product's price changed after this recommendation was generated. Generate a new recommendation.");
    }

    // Conditional update so two people deciding at once cannot both succeed.
    const claimed = await tx.priceRecommendation.updateMany({
      where: { id: rec.id, organizationId: ctx.orgId, status: "PENDING" },
      data: { status: decision, decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: note },
    });
    if (claimed.count === 0) throw new UserError("Someone else decided on this recommendation first.");

    if (changesPrice) {
      await tx.product.update({ where: { id: product.id }, data: { currentPrice: rec.recommendedPrice! } });
      await tx.priceChange.create({
        data: {
          organizationId: ctx.orgId,
          productId: product.id,
          oldPrice: rec.currentPrice,
          newPrice: rec.recommendedPrice!,
          recommendationId: rec.id,
          changedById: ctx.user.id,
          reason: "Approved recommendation",
        },
      });
    }
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: decision === "APPROVED" ? "recommendation.approved" : "recommendation.rejected",
      entityType: "PriceRecommendation",
      entityId: rec.id,
      metadata: { sku: product.sku, currentPrice: rec.currentPrice.toString(), recommendedPrice: rec.recommendedPrice?.toString() ?? null, priceChanged: changesPrice, note },
    });
    return { priceChanged: changesPrice };
  });
}

export async function listRecommendations(ctx: OrgContext, status?: RecommendationStatus | "ALL") {
  return db().priceRecommendation.findMany({
    where: { organizationId: ctx.orgId, ...(status && status !== "ALL" ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      outcome: true,
      message: true,
      objective: true,
      currentPrice: true,
      recommendedPrice: true,
      baseline: true,
      best: true,
      createdAt: true,
      decidedAt: true,
      product: { select: { id: true, sku: true, name: true } },
      modelVersion: { select: { version: true } },
    },
  });
}

export async function getRecommendation(ctx: OrgContext, id: string) {
  const rec = await db().priceRecommendation.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      product: { select: { id: true, sku: true, name: true, currentPrice: true } },
      modelVersion: { select: { id: true, version: true, algorithm: true, trainedFrom: true, trainedTo: true, trainRows: true, metrics: true, baselineMetrics: true, featureNames: true } },
      priceChange: true,
    },
  });
  if (!rec) return null;
  const userIds = [rec.createdById, rec.decidedById].filter((v): v is string => Boolean(v));
  const users = await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? null;
  return { ...rec, createdByName: nameOf(rec.createdById), decidedByName: nameOf(rec.decidedById) };
}
