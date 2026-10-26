/**
 * Builds a regular demand series from transaction-level sales and turns it into model features.
 *
 * Assumptions (surfaced to users with every forecast):
 * - Periods with no sales records are treated as zero demand, not missing data.
 * - The price for a period with no sales is carried forward from the last observed price
 *   (or the product's list price before the first sale).
 * - Competitor prices are carried forward from the latest observation and are missing before it.
 */

export type Granularity = "DAILY" | "WEEKLY";

export interface SaleInput {
  date: Date;
  quantity: number;
  unitPrice: number;
  promotion: boolean;
}

export interface CompetitorInput {
  observedAt: Date;
  price: number;
}

export interface Period {
  /** UTC period start, formatted YYYY-MM-DD. */
  key: string;
  start: Date;
  units: number;
  /** Quantity-weighted average price, or the carried-forward price when nothing sold. */
  price: number;
  /** Whether the price was observed in this period's transactions. */
  priceObserved: boolean;
  /** Share of units sold on promotion (0 when nothing sold). */
  promo: number;
  /** Mean competitor price in effect, NaN when unknown. */
  competitorPrice: number;
}

const DAY_MS = 86_400_000;

export function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO weeks start on Monday. */
export function periodStart(d: Date, granularity: Granularity): Date {
  const day = startOfUtcDay(d);
  if (granularity === "DAILY") return day;
  const dow = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - dow * DAY_MS);
}

export function addPeriods(d: Date, count: number, granularity: Granularity): Date {
  return new Date(d.getTime() + count * (granularity === "DAILY" ? 1 : 7) * DAY_MS);
}

export function buildSeries(
  sales: SaleInput[],
  competitor: CompetitorInput[],
  granularity: Granularity,
  options: { listPrice: number; end?: Date },
): Period[] {
  if (sales.length === 0) return [];
  const sorted = [...sales].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = periodStart(sorted[0].date, granularity);
  const last = periodStart(options.end ?? sorted[sorted.length - 1].date, granularity);

  const agg = new Map<string, { units: number; revenue: number; promoUnits: number }>();
  for (const s of sorted) {
    if (s.quantity < 0) continue;
    const key = toDayKey(periodStart(s.date, granularity));
    const a = agg.get(key) ?? { units: 0, revenue: 0, promoUnits: 0 };
    a.units += s.quantity;
    a.revenue += s.quantity * s.unitPrice;
    if (s.promotion) a.promoUnits += s.quantity;
    agg.set(key, a);
  }

  const comps = [...competitor].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  let ci = 0;

  const periods: Period[] = [];
  let lastPrice = options.listPrice;
  let lastComp = Number.NaN;
  for (let t = first; t.getTime() <= last.getTime(); t = addPeriods(t, 1, granularity)) {
    const key = toDayKey(t);
    const periodEnd = addPeriods(t, 1, granularity).getTime();
    const compWindow: number[] = [];
    while (ci < comps.length && comps[ci].observedAt.getTime() < periodEnd) {
      compWindow.push(comps[ci].price);
      ci++;
    }
    if (compWindow.length > 0) lastComp = mean(compWindow);

    const a = agg.get(key);
    let price = lastPrice;
    let observed = false;
    if (a && a.units > 0) {
      price = a.revenue / a.units;
      observed = true;
      lastPrice = price;
    }
    periods.push({
      key,
      start: t,
      units: a?.units ?? 0,
      price,
      priceObserved: observed,
      promo: a && a.units > 0 ? a.promoUnits / a.units : 0,
      competitorPrice: lastComp,
    });
  }
  return periods;
}

export interface FeatureConfig {
  granularity: Granularity;
  /** Median observed price in training data; price features are expressed relative to it. */
  referencePrice: number;
  shortWindow: number;
  longWindow: number;
}

export const FEATURE_NAMES = [
  "price_ratio",
  "promotion",
  "competitor_price_ratio",
  "day_of_week",
  "month",
  "season_sin",
  "season_cos",
  "recent_demand_short",
  "recent_demand_long",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  price_ratio: "Price relative to typical price",
  promotion: "Promotion",
  competitor_price_ratio: "Price relative to competitors",
  day_of_week: "Day of week",
  month: "Month",
  season_sin: "Time of year (seasonal)",
  season_cos: "Time of year (seasonal)",
  recent_demand_short: "Recent demand (short window)",
  recent_demand_long: "Recent demand (long window)",
};

/** Demand should not rise when our price rises, all else equal. */
export const MONOTONE: number[] = FEATURE_NAMES.map((f) =>
  f === "price_ratio" || f === "competitor_price_ratio" ? -1 : 0,
);

export function windowsFor(granularity: Granularity): { shortWindow: number; longWindow: number } {
  return granularity === "DAILY" ? { shortWindow: 7, longWindow: 28 } : { shortWindow: 4, longWindow: 12 };
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Features for one period. `history` holds the demand values (observed or predicted) of all
 * prior periods, so the rolling features never see the period being predicted.
 */
export function featureVector(
  period: { start: Date; price: number; promo: number; competitorPrice: number },
  history: number[],
  config: FeatureConfig,
): number[] {
  const d = period.start;
  const dayOfYear = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS);
  const angle = (2 * Math.PI * dayOfYear) / 365.25;
  const shortHist = history.slice(-config.shortWindow);
  const longHist = history.slice(-config.longWindow);
  return [
    period.price / config.referencePrice,
    period.promo,
    Number.isNaN(period.competitorPrice) || period.competitorPrice <= 0
      ? Number.NaN
      : period.price / period.competitorPrice,
    config.granularity === "DAILY" ? (d.getUTCDay() + 6) % 7 : Number.NaN,
    d.getUTCMonth() + 1,
    Math.sin(angle),
    Math.cos(angle),
    mean(shortHist),
    mean(longHist),
  ];
}

/** Training matrix: one row per period that has a full long window of history behind it. */
export function trainingMatrix(periods: Period[], config: FeatureConfig): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  const units = periods.map((p) => p.units);
  for (let t = config.longWindow; t < periods.length; t++) {
    X.push(featureVector(periods[t], units.slice(0, t), config));
    y.push(periods[t].units);
  }
  return { X, y };
}
