import type { CompetitorInput, SaleInput } from "@/lib/ml/features";

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Poisson sample by inversion; fine for the small means used in tests. */
export function poisson(lambda: number, r: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

/**
 * Synthetic daily sales with a known constant-elasticity demand curve, weekly seasonality and
 * occasional promotions. For tests only.
 */
export function syntheticSales(options: {
  days: number;
  basePrice: number;
  elasticity: number;
  baseDemand: number;
  seed: number;
  start?: string;
  priceLevels?: number[];
}): { sales: SaleInput[]; competitor: CompetitorInput[] } {
  const r = rng(options.seed);
  const start = new Date(`${options.start ?? "2025-01-06"}T00:00:00Z`);
  const levels = options.priceLevels ?? [0.9, 0.95, 1, 1.05, 1.1];
  const sales: SaleInput[] = [];
  const competitor: CompetitorInput[] = [];
  let level = 1;
  for (let d = 0; d < options.days; d++) {
    const date = new Date(start.getTime() + d * 86_400_000);
    if (d % 14 === 0) level = levels[Math.floor(r() * levels.length)];
    const price = Math.round(options.basePrice * level * 100) / 100;
    const promo = d % 30 >= 27;
    const dow = (date.getUTCDay() + 6) % 7;
    const weekly = dow >= 5 ? 1.4 : 1;
    const lambda =
      options.baseDemand * weekly * (promo ? 1.5 : 1) * Math.pow(price / options.basePrice, options.elasticity);
    const q = poisson(lambda, r);
    if (q > 0) sales.push({ date, quantity: q, unitPrice: price, promotion: promo });
    if (d % 7 === 0) competitor.push({ observedAt: date, price: options.basePrice * (0.97 + r() * 0.06) });
  }
  return { sales, competitor };
}
