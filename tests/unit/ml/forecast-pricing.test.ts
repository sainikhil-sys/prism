import { describe, expect, it } from "vitest";
import { predict, trainGbdt } from "@/lib/ml/gbdt";
import { buildSeries, featureVector, periodStart, trainingMatrix, windowsFor } from "@/lib/ml/features";
import { fitDemandModel, InsufficientDataError, runForecast, seasonalNaive } from "@/lib/ml/forecast";
import { errorMetrics } from "@/lib/ml/metrics";
import { DEFAULT_POLICY, optimizePrice, priceBounds } from "@/lib/ml/pricing";
import { projectInventory } from "@/lib/ml/inventory";
import { rng, syntheticSales } from "./helpers";

describe("series construction", () => {
  it("fills days without sales with zero demand and carries the last price forward", () => {
    const sales = [
      { date: new Date("2025-03-01T10:00:00Z"), quantity: 2, unitPrice: 10, promotion: false },
      { date: new Date("2025-03-01T15:00:00Z"), quantity: 2, unitPrice: 12, promotion: true },
      { date: new Date("2025-03-04T09:00:00Z"), quantity: 1, unitPrice: 9, promotion: false },
    ];
    const s = buildSeries(sales, [], "DAILY", { listPrice: 10 });
    expect(s.map((p) => p.key)).toEqual(["2025-03-01", "2025-03-02", "2025-03-03", "2025-03-04"]);
    expect(s.map((p) => p.units)).toEqual([4, 0, 0, 1]);
    expect(s[0].price).toBeCloseTo(11);
    expect(s[0].promo).toBeCloseTo(0.5);
    expect(s[1].price).toBeCloseTo(11);
    expect(s[1].priceObserved).toBe(false);
  });

  it("starts weekly periods on Monday", () => {
    expect(periodStart(new Date("2025-03-02T12:00:00Z"), "WEEKLY").toISOString().slice(0, 10)).toBe("2025-02-24");
    expect(periodStart(new Date("2025-03-03T00:00:00Z"), "WEEKLY").toISOString().slice(0, 10)).toBe("2025-03-03");
  });

  it("only uses demand from earlier periods in rolling features (no leakage)", () => {
    const { sales } = syntheticSales({ days: 60, basePrice: 20, elasticity: -1.5, baseDemand: 5, seed: 1 });
    const s = buildSeries(sales, [], "DAILY", { listPrice: 20 });
    const config = { granularity: "DAILY" as const, referencePrice: 20, ...windowsFor("DAILY") };
    const { X } = trainingMatrix(s, config);
    // Changing the target period's own demand must not change its features.
    const t = config.longWindow + 5;
    const units = s.map((p) => p.units);
    const before = featureVector(s[t], units.slice(0, t), config);
    units[t] += 1000;
    const after = featureVector(s[t], units.slice(0, t), config);
    expect(after).toEqual(before);
    expect(X[5]).toEqual(before);
  });
});

describe("gradient boosting", () => {
  it("respects a decreasing monotone constraint on price", () => {
    const r = rng(3);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 500; i++) {
      const price = 0.8 + r() * 0.4;
      const noise = r();
      X.push([price, noise]);
      // Noisy data where an unconstrained model could fit upward wiggles in price.
      y.push(Math.max(0, Math.round(10 * Math.pow(price, -2) + (r() - 0.5) * 6)));
    }
    const model = trainGbdt(X, y, ["price", "noise"], { monotone: [-1, 0], nTrees: 80 });
    for (const noise of [0.1, 0.5, 0.9]) {
      let prev = Infinity;
      for (let p = 0.75; p <= 1.25; p += 0.01) {
        const v = predict(model, [p, noise]);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
      }
    }
  });

  it("rejects targets Poisson loss cannot model", () => {
    expect(() => trainGbdt([[1], [2]], [0, 0], ["x"])).toThrow();
    expect(() => trainGbdt([[1], [2]], [-1, 2], ["x"])).toThrow();
  });
});

describe("forecasting", () => {
  const { sales, competitor } = syntheticSales({ days: 240, basePrice: 20, elasticity: -1.8, baseDemand: 8, seed: 11 });
  const periods = buildSeries(sales, competitor, "DAILY", { listPrice: 20 });

  it("evaluates on a holdout that is strictly after the training data", () => {
    const res = runForecast({ periods, granularity: "DAILY", horizon: 14, futurePrice: 20, asOf: new Date("2025-09-10") });
    expect(res.backtest.length).toBe(res.holdoutLength);
    const trainEnd = periods[periods.length - res.holdoutLength - 1].key;
    expect(res.backtest.every((b) => b.key > trainEnd)).toBe(true);
    expect(res.future).toHaveLength(14);
    expect(res.future[0].key > periods[periods.length - 1].key).toBe(true);
    for (const f of res.future) {
      expect(f.lower).toBeGreaterThanOrEqual(0);
      expect(f.lower).toBeLessThanOrEqual(f.mean + 1e-9);
      expect(f.upper).toBeGreaterThanOrEqual(f.mean - 1e-9);
    }
  });

  it("is at least as accurate as the seasonal naive baseline on data with a learnable signal", () => {
    const res = runForecast({ periods, granularity: "DAILY", horizon: 7, futurePrice: 20, asOf: new Date("2025-09-10") });
    expect(res.metrics.mae).toBeLessThanOrEqual(res.baselineMetrics.mae * 1.05);
  });

  it("refuses to forecast with too little history", () => {
    expect(() =>
      runForecast({ periods: periods.slice(0, 40), granularity: "DAILY", horizon: 7, futurePrice: 20, asOf: new Date() }),
    ).toThrow(InsufficientDataError);
  });

  it("supports weekly granularity", () => {
    const weekly = buildSeries(sales, competitor, "WEEKLY", { listPrice: 20 });
    const res = runForecast({ periods: weekly, granularity: "WEEKLY", horizon: 4, futurePrice: 20, asOf: new Date("2025-09-10") });
    expect(res.future).toHaveLength(4);
    expect(res.metrics.n).toBe(res.holdoutLength);
  });

  it("handles intermittent demand and warns about it", () => {
    const sparse = syntheticSales({ days: 200, basePrice: 50, elasticity: -1.2, baseDemand: 0.3, seed: 5 });
    const s = buildSeries(sparse.sales, sparse.competitor, "DAILY", { listPrice: 50 });
    const res = runForecast({ periods: s, granularity: "DAILY", horizon: 7, futurePrice: 50, asOf: new Date("2025-07-30") });
    expect(res.dataQuality.zeroShare).toBeGreaterThan(0.5);
    expect(res.warnings.some((w) => w.includes("intermittent"))).toBe(true);
    expect(res.future.every((f) => Number.isFinite(f.mean) && f.mean >= 0)).toBe(true);
  });

  it("computes metrics correctly and seasonal naive repeats the last season", () => {
    const m = errorMetrics([2, 0, 4], [1, 1, 4], 1);
    expect(m.mae).toBeCloseTo(2 / 3);
    expect(m.wape).toBeCloseTo(2 / 6);
    expect(m.bias).toBeCloseTo(0);
    expect(m.mase).toBeCloseTo(2 / 3);
    expect(errorMetrics([0, 0], [1, 1], null).wape).toBeNull();
    expect(seasonalNaive([1, 2, 3, 4, 5, 6, 7, 8], 9, 7)).toEqual([2, 3, 4, 5, 6, 7, 8, 2, 3]);
  });
});

describe("price optimization", () => {
  const { sales, competitor } = syntheticSales({ days: 240, basePrice: 20, elasticity: -2.5, baseDemand: 10, seed: 21 });
  const periods = buildSeries(sales, competitor, "DAILY", { listPrice: 20 });
  const dm = fitDemandModel(periods, "DAILY");
  const product = { costPrice: 12, currentPrice: 20, inventoryQty: null, minPrice: null, maxPrice: null };

  it("only recommends prices that satisfy margin, change and range constraints", () => {
    const policy = { ...DEFAULT_POLICY, minMarginPct: 0.3, maxChangePct: 0.08 };
    const res = optimizePrice(dm, periods, product, policy);
    expect(["RECOMMENDED", "HOLD"]).toContain(res.status);
    const p = res.recommendedPrice!;
    expect((p - product.costPrice) / p).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(Math.abs(p - 20) / 20).toBeLessThanOrEqual(0.08 + 1e-9);
    for (const c of res.candidates) {
      expect(c.price).toBeGreaterThanOrEqual(res.lower!.value);
      expect(c.price).toBeLessThanOrEqual(res.upper!.value);
    }
  });

  it("picks the candidate with the best objective", () => {
    const res = optimizePrice(dm, periods, product, { ...DEFAULT_POLICY, holdThresholdPct: 0 });
    const bestObjective = Math.max(...res.candidates.map((c) => c.objective));
    expect(res.best!.objective).toBeCloseTo(bestObjective, 9);
  });

  it("produces additive SHAP explanations for the recommendation", () => {
    const res = optimizePrice(dm, periods, product, DEFAULT_POLICY);
    expect(res.explanation).not.toBeNull();
    expect(res.explanation!.additivityError).toBeLessThan(1e-8);
    expect(res.explanation!.contributions.length).toBeGreaterThan(0);
  });

  it("caps expected units at available inventory", () => {
    const res = optimizePrice(dm, periods, { ...product, inventoryQty: 5 }, DEFAULT_POLICY);
    for (const c of res.candidates) expect(c.expectedUnits).toBeLessThanOrEqual(5);
    expect(res.bindingConstraints).toContain("Inventory limits expected sales");
  });

  it("reports infeasible policies instead of recommending", () => {
    // Cost 19 with a 30% minimum margin needs price >= 27.14, but max change caps it at 22.
    const res = optimizePrice(dm, periods, { ...product, costPrice: 19 }, { ...DEFAULT_POLICY, minMarginPct: 0.3 });
    expect(res.status).toBe("INFEASIBLE");
    expect(res.recommendedPrice).toBeNull();
  });

  it("refuses to recommend when historical prices never varied", () => {
    const flat = syntheticSales({ days: 200, basePrice: 20, elasticity: -2, baseDemand: 10, seed: 4, priceLevels: [1] });
    const s = buildSeries(flat.sales, flat.competitor, "DAILY", { listPrice: 20 });
    const flatModel = fitDemandModel(s, "DAILY");
    const res = optimizePrice(flatModel, s, product, DEFAULT_POLICY);
    expect(res.status).toBe("INSUFFICIENT_PRICE_VARIATION");
    expect(res.recommendedPrice).toBeNull();
  });

  it("computes bounds from the tightest constraint and rounds inward", () => {
    const b = priceBounds(
      { costPrice: 10, currentPrice: 20, inventoryQty: null, minPrice: 19.5, maxPrice: null },
      { ...DEFAULT_POLICY, maxChangePct: 0.1, minMarginPct: 0.1 },
      { min: 15, max: 25 },
    );
    expect(b.lower).toEqual({ value: 19.5, source: "Product minimum price" });
    expect(b.upper).toEqual({ value: 22, source: "Maximum price change" });
  });
});

describe("inventory projection", () => {
  it("projects the stockout period and suggests a reorder", () => {
    const forecast = Array.from({ length: 10 }, (_, i) => ({ key: `2025-01-${String(i + 1).padStart(2, "0")}`, mean: 5 }));
    const res = projectInventory({ onHand: 12, reorderPoint: 20, leadTimeDays: 3, forecast, periodDays: 1, rmse: 1 });
    expect(res.stockoutPeriod).toBe("2025-01-03");
    expect(res.daysOfCover).toBeCloseTo(2.4);
    expect(res.belowReorderPoint).toBe(true);
    expect(res.reorder?.recommended).toBe(true);
    expect(res.reorder!.quantity).toBeGreaterThan(0);
  });

  it("explains when lead time is missing", () => {
    const res = projectInventory({ onHand: 100, reorderPoint: null, leadTimeDays: null, forecast: [], periodDays: 1, rmse: null });
    expect(res.reorder).toBeNull();
    expect(res.limitation).toMatch(/lead time/);
  });
});
