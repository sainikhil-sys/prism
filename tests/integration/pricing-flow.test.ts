import { beforeAll, describe, expect, it } from "vitest";
import { generateSales, productsCsv, salesCsvFor, SAMPLE_PRODUCTS } from "../../prisma/sample-data";
import { UserError } from "@/server/action-result";
import { db } from "@/server/db";
import { getLatestForecast, runProductForecast } from "@/server/services/forecasts";
import { importProducts, importSales } from "@/server/services/imports";
import { decideRecommendation, generateRecommendation } from "@/server/services/recommendations";
import { updateProduct } from "@/server/services/products";
import type { OrgContext } from "@/server/context";
import { createOrgContext, resetDatabase } from "./helpers";

describe("forecast, recommendation and decision", () => {
  let owner: OrgContext;
  let mugId: string;
  let grinderId: string;

  beforeAll(async () => {
    await resetDatabase();
    owner = await createOrgContext("OWNER");
    await importProducts(owner, "products.csv", productsCsv(), { strict: true });
    const end = new Date("2025-09-30T00:00:00Z");
    const sales = SAMPLE_PRODUCTS.flatMap((p, i) => generateSales(p, 300, end, 100 + i));
    const res = await importSales(owner, "sales.csv", salesCsvFor(sales), { strict: true });
    expect(res.status).toBe("COMPLETED");
    mugId = (await db().product.findFirstOrThrow({ where: { organizationId: owner.orgId, sku: "SAMPLE-MUG-01" } })).id;
    grinderId = (await db().product.findFirstOrThrow({ where: { organizationId: owner.orgId, sku: "SAMPLE-GRINDER-04" } })).id;
  });

  it("trains, versions and stores a forecast with backtest and future points", async () => {
    const r1 = await runProductForecast(owner, mugId, "DAILY", 21);
    const r2 = await runProductForecast(owner, mugId, "WEEKLY", 6);
    expect(r2.modelVersion).toBe(r1.modelVersion + 1);
    const latest = await getLatestForecast(owner, mugId);
    expect(latest?.granularity).toBe("WEEKLY");
    expect(latest!.points.filter((p) => p.kind === "FUTURE")).toHaveLength(6);
    expect(latest!.points.filter((p) => p.kind === "BACKTEST").every((p) => p.actual !== null)).toBe(true);
  });

  it("refuses to recommend a price for a product whose price never varied", async () => {
    const rec = await generateRecommendation(owner, grinderId);
    expect(rec.status).toBe("NO_RECOMMENDATION");
    expect(rec.outcome).toBe("INSUFFICIENT_PRICE_VARIATION");
    expect(rec.recommendedPrice).toBeNull();
    await expect(decideRecommendation(owner, rec.id, "APPROVED", null)).rejects.toBeInstanceOf(UserError);
  });

  it("generates a constrained, explained recommendation and applies it on approval", async () => {
    const rec = await generateRecommendation(owner, mugId);
    expect(rec.status).toBe("PENDING");
    const policy = await db().pricingPolicy.findUniqueOrThrow({ where: { organizationId: owner.orgId } });
    const price = rec.recommendedPrice!.toNumber();
    expect((price - 4.2) / price).toBeGreaterThanOrEqual(policy.minMarginPct.toNumber() - 1e-9);
    expect(Math.abs(price - 12) / 12).toBeLessThanOrEqual(policy.maxChangePct.toNumber() + 1e-9);
    const explanation = rec.explanation as { additivityError: number; contributions: unknown[] };
    expect(explanation.additivityError).toBeLessThan(1e-6);
    expect(explanation.contributions.length).toBeGreaterThan(0);

    const res = await decideRecommendation(owner, rec.id, "APPROVED", "Looks reasonable");
    const product = await db().product.findUniqueOrThrow({ where: { id: mugId } });
    if (res.priceChanged) {
      expect(product.currentPrice.toNumber()).toBe(price);
      const change = await db().priceChange.findUniqueOrThrow({ where: { recommendationId: rec.id } });
      expect(change.newPrice.toNumber()).toBe(price);
    } else {
      expect(product.currentPrice.toNumber()).toBe(12);
    }
    const log = await db().auditLog.findMany({ where: { organizationId: owner.orgId, entityId: rec.id }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["recommendation.generated", "recommendation.approved"]);
    await expect(decideRecommendation(owner, rec.id, "REJECTED", null)).rejects.toBeInstanceOf(UserError);
  });

  it("supersedes older pending recommendations and blocks approval after a manual price change", async () => {
    const first = await generateRecommendation(owner, mugId);
    const second = await generateRecommendation(owner, mugId);
    expect((await db().priceRecommendation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SUPERSEDED");

    const p = await db().product.findUniqueOrThrow({ where: { id: mugId } });
    await updateProduct(owner, mugId, {
      sku: p.sku,
      name: p.name,
      category: p.category ?? "",
      costPrice: p.costPrice.toNumber(),
      currentPrice: p.currentPrice.toNumber() + 0.37,
      minPrice: null,
      maxPrice: null,
      inventoryQty: p.inventoryQty,
      reorderPoint: p.reorderPoint,
      leadTimeDays: p.leadTimeDays,
      active: true,
    });
    if (second.recommendedPrice && !second.recommendedPrice.equals(second.currentPrice)) {
      await expect(decideRecommendation(owner, second.id, "APPROVED", null)).rejects.toThrow(/price changed/);
    }
    // Rejection never touches the price, so it is still allowed.
    await decideRecommendation(owner, second.id, "REJECTED", "Price was changed manually");
    expect((await db().priceRecommendation.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("REJECTED");
  });
});
