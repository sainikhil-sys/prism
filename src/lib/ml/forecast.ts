/**
 * Demand forecasting: chronological backtest, recursive multi-step forecasts and data checks.
 */
import { predict, trainGbdt, type GbdtModel, type GbdtParams } from "./gbdt";
import {
  FEATURE_NAMES,
  MONOTONE,
  addPeriods,
  featureVector,
  mean,
  median,
  trainingMatrix,
  windowsFor,
  type FeatureConfig,
  type Granularity,
  type Period,
} from "./features";
import { errorMetrics, naiveScale, quantile, type ErrorMetrics } from "./metrics";

/**
 * Minimum history so that, after the long rolling window and the backtest holdout, enough rows
 * remain to train (see the unit test that forecasts at exactly this length).
 */
export const MIN_PERIODS: Record<Granularity, number> = { DAILY: 70, WEEKLY: 36 };

export interface PriceStats {
  min: number;
  max: number;
  distinct: number;
  /** Coefficient of variation of observed prices. */
  cv: number;
}

export interface DemandModel {
  model: GbdtModel;
  config: FeatureConfig;
  priceStats: PriceStats;
  trainedFrom: string;
  trainedTo: string;
  trainRows: number;
}

export interface FuturePeriod {
  start: Date;
  price: number;
  promo: number;
  competitorPrice: number;
}

export class InsufficientDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientDataError";
  }
}

export function priceStats(periods: Period[]): PriceStats {
  const observed = periods.filter((p) => p.priceObserved).map((p) => p.price);
  if (observed.length === 0) return { min: Number.NaN, max: Number.NaN, distinct: 0, cv: 0 };
  const m = mean(observed);
  const sd = Math.sqrt(mean(observed.map((v) => (v - m) ** 2)));
  return {
    min: Math.min(...observed),
    max: Math.max(...observed),
    distinct: new Set(observed.map((v) => v.toFixed(2))).size,
    cv: m > 0 ? sd / m : 0,
  };
}

export function fitDemandModel(
  periods: Period[],
  granularity: Granularity,
  params: Partial<GbdtParams> = {},
): DemandModel {
  const windows = windowsFor(granularity);
  const observed = periods.filter((p) => p.priceObserved).map((p) => p.price);
  const referencePrice = median(observed);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new InsufficientDataError("No sales with a positive price were found for this product.");
  }
  const config: FeatureConfig = { granularity, referencePrice, ...windows };
  const { X, y } = trainingMatrix(periods, config);
  if (X.length < 2 * (params.minChildSamples ?? 8)) {
    throw new InsufficientDataError("Not enough history to train a model.");
  }
  if (!y.some((v) => v > 0)) {
    throw new InsufficientDataError("The training window contains no sales.");
  }
  const model = trainGbdt(X, y, [...FEATURE_NAMES], { monotone: MONOTONE, ...params });
  return {
    model,
    config,
    priceStats: priceStats(periods),
    trainedFrom: periods[config.longWindow].key,
    trainedTo: periods[periods.length - 1].key,
    trainRows: X.length,
  };
}

/**
 * Forecasts future periods one step at a time, feeding each prediction back into the
 * rolling-demand features of later periods.
 */
export function recursiveForecast(
  dm: DemandModel,
  history: number[],
  future: FuturePeriod[],
): { mean: number[]; features: number[][] } {
  const hist = [...history];
  const out: number[] = [];
  const features: number[][] = [];
  for (const period of future) {
    const x = featureVector(period, hist, dm.config);
    const mu = Math.max(0, predict(dm.model, x));
    out.push(mu);
    features.push(x);
    hist.push(mu);
  }
  return { mean: out, features };
}

export function seasonLength(granularity: Granularity): number {
  return granularity === "DAILY" ? 7 : 1;
}

/** Repeats the last observed season. */
export function seasonalNaive(history: number[], horizon: number, m: number): number[] {
  const out: number[] = [];
  for (let h = 0; h < horizon; h++) {
    const idx = history.length - m + (h % m);
    out.push(idx >= 0 ? history[idx] : (history[history.length - 1] ?? 0));
  }
  return out;
}

export interface BacktestPoint {
  key: string;
  actual: number;
  forecast: number;
  baseline: number;
}

export interface ForecastPoint {
  key: string;
  mean: number;
  lower: number;
  upper: number;
  price: number;
}

export interface ForecastResult {
  granularity: Granularity;
  horizon: number;
  holdoutLength: number;
  backtest: BacktestPoint[];
  metrics: ErrorMetrics;
  baselineMetrics: ErrorMetrics;
  future: ForecastPoint[];
  final: DemandModel;
  dataQuality: DataQuality;
  warnings: string[];
}

export interface DataQuality {
  periods: number;
  firstPeriod: string;
  lastPeriod: string;
  zeroShare: number;
  totalUnits: number;
  priceDistinct: number;
  priceCv: number;
  competitorCoverage: number;
  promoShare: number;
}

export function holdoutLength(n: number, granularity: Granularity): number {
  const [lo, hi] = granularity === "DAILY" ? [7, 28] : [4, 12];
  return Math.min(hi, Math.max(lo, Math.floor(n * 0.2)));
}

export function assessData(periods: Period[]): DataQuality {
  const n = periods.length;
  const ps = priceStats(periods);
  return {
    periods: n,
    firstPeriod: periods[0]?.key ?? "",
    lastPeriod: periods[n - 1]?.key ?? "",
    zeroShare: n ? periods.filter((p) => p.units === 0).length / n : 0,
    totalUnits: periods.reduce((s, p) => s + p.units, 0),
    priceDistinct: ps.distinct,
    priceCv: ps.cv,
    competitorCoverage: n ? periods.filter((p) => !Number.isNaN(p.competitorPrice)).length / n : 0,
    promoShare: n ? periods.filter((p) => p.promo > 0).length / n : 0,
  };
}

export function dataWarnings(q: DataQuality, granularity: Granularity, asOf: Date): string[] {
  const w: string[] = [];
  if (q.zeroShare >= 0.3) {
    w.push(
      `${Math.round(q.zeroShare * 100)}% of periods have zero sales. Demand is intermittent, so point forecasts are averages and individual periods will vary widely.`,
    );
  }
  if (q.priceDistinct < 3 || q.priceCv < 0.02) {
    w.push(
      "Historical prices barely varied, so the model has little evidence about how demand responds to price.",
    );
  }
  if (q.competitorCoverage === 0) w.push("No competitor prices were available, so competitor effects are not modeled.");
  if (q.periods < MIN_PERIODS[granularity] * 2) {
    w.push("History is short. Seasonal patterns longer than the history cannot be learned.");
  }
  const last = new Date(`${q.lastPeriod}T00:00:00Z`).getTime();
  const staleDays = (asOf.getTime() - last) / 86_400_000;
  if (staleDays > (granularity === "DAILY" ? 14 : 28)) {
    w.push(`The most recent sales data is from ${q.lastPeriod}. Forecasts start after that date, not today.`);
  }
  return w;
}

export interface RunForecastInput {
  periods: Period[];
  granularity: Granularity;
  horizon: number;
  /** Price assumed for future periods. */
  futurePrice: number;
  asOf: Date;
  params?: Partial<GbdtParams>;
}

export function runForecast(input: RunForecastInput): ForecastResult {
  const { periods, granularity, horizon } = input;
  if (periods.length < MIN_PERIODS[granularity]) {
    throw new InsufficientDataError(
      `At least ${MIN_PERIODS[granularity]} ${granularity === "DAILY" ? "days" : "weeks"} of history are needed; found ${periods.length}.`,
    );
  }

  // Chronological split: the holdout is strictly after every training period.
  const H = holdoutLength(periods.length, granularity);
  const train = periods.slice(0, periods.length - H);
  const test = periods.slice(periods.length - H);
  const backtestModel = fitDemandModel(train, granularity, input.params);
  const trainUnits = train.map((p) => p.units);
  const bt = recursiveForecast(
    backtestModel,
    trainUnits,
    test.map((p) => ({ start: p.start, price: p.price, promo: p.promo, competitorPrice: p.competitorPrice })),
  );
  const m = seasonLength(granularity);
  const baseline = seasonalNaive(trainUnits, H, m);
  const actual = test.map((p) => p.units);
  const scale = naiveScale(trainUnits, m);
  const metrics = errorMetrics(actual, bt.mean, scale);
  const baselineMetrics = errorMetrics(actual, baseline, scale);
  const residuals = actual.map((a, i) => a - bt.mean[i]);
  const qLo = quantile(residuals, 0.1);
  const qHi = quantile(residuals, 0.9);

  // Refit on all history for the forward-looking forecast.
  const final = fitDemandModel(periods, granularity, input.params);
  const last = periods[periods.length - 1];
  const lastComp = last.competitorPrice;
  const future: FuturePeriod[] = [];
  for (let k = 1; k <= horizon; k++) {
    future.push({ start: addPeriods(last.start, k, granularity), price: input.futurePrice, promo: 0, competitorPrice: lastComp });
  }
  const fc = recursiveForecast(final, periods.map((p) => p.units), future);

  const quality = assessData(periods);
  return {
    granularity,
    horizon,
    holdoutLength: H,
    backtest: test.map((p, i) => ({ key: p.key, actual: actual[i], forecast: bt.mean[i], baseline: baseline[i] })),
    metrics,
    baselineMetrics,
    future: future.map((f, i) => ({
      key: f.start.toISOString().slice(0, 10),
      mean: fc.mean[i],
      lower: Math.max(0, fc.mean[i] + qLo),
      upper: Math.max(0, fc.mean[i] + qHi),
      price: f.price,
    })),
    final,
    dataQuality: quality,
    warnings: dataWarnings(quality, granularity, input.asOf),
  };
}
