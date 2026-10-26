/**
 * Synthetic sample data for local development, demos and tests. NEVER for production use.
 * Demand follows a known constant-elasticity curve with weekly seasonality, promotions and noise,
 * so model behaviour can be checked against the truth.
 */

export interface SampleProduct {
  sku: string;
  name: string;
  category: string;
  cost: number;
  basePrice: number;
  elasticity: number;
  baseDemand: number;
  inventory: number | null;
  reorderPoint: number | null;
  leadTimeDays: number | null;
  /** Relative price levels used over the history; [1] means the price never changed. */
  priceLevels: number[];
}

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  { sku: "SAMPLE-MUG-01", name: "Sample stoneware mug", category: "Kitchen", cost: 4.2, basePrice: 12, elasticity: -2.1, baseDemand: 14, inventory: 420, reorderPoint: 120, leadTimeDays: 10, priceLevels: [0.9, 0.95, 1, 1.05, 1.1] },
  { sku: "SAMPLE-KETTLE-02", name: "Sample pour-over kettle", category: "Kitchen", cost: 18, basePrice: 42, elasticity: -1.6, baseDemand: 5, inventory: 60, reorderPoint: 40, leadTimeDays: 21, priceLevels: [0.92, 1, 1.06] },
  { sku: "SAMPLE-FILTER-03", name: "Sample paper filters (100)", category: "Consumables", cost: 1.1, basePrice: 4.5, elasticity: -2.6, baseDemand: 22, inventory: null, reorderPoint: null, leadTimeDays: null, priceLevels: [0.9, 1, 1.1] },
  { sku: "SAMPLE-GRINDER-04", name: "Sample burr grinder", category: "Equipment", cost: 55, basePrice: 129, elasticity: -1.3, baseDemand: 0.6, inventory: 14, reorderPoint: 5, leadTimeDays: 30, priceLevels: [1] },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function poisson(lambda: number, r: () => number): number {
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (r() + r() + r() - 1.5) * 2));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

export interface SampleSale {
  sku: string;
  date: string;
  quantity: number;
  unitPrice: number;
  promotion: boolean;
}

export function generateSales(product: SampleProduct, days: number, end: Date, seed: number): SampleSale[] {
  const r = rng(seed);
  const out: SampleSale[] = [];
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  let level = 1;
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(endDay - i * 86_400_000);
    const idx = days - 1 - i;
    if (idx % 14 === 0) level = product.priceLevels[Math.floor(r() * product.priceLevels.length)];
    const promo = idx % 35 >= 32;
    const price = Math.round(product.basePrice * level * (promo ? 0.9 : 1) * 100) / 100;
    const dow = (t.getUTCDay() + 6) % 7;
    const season = 1 + 0.15 * Math.sin((2 * Math.PI * idx) / 365);
    const lambda = product.baseDemand * season * (dow >= 5 ? 1.35 : 1) * (promo ? 1.4 : 1) * Math.pow(price / product.basePrice, product.elasticity);
    const q = poisson(lambda, r);
    if (q > 0) out.push({ sku: product.sku, date: t.toISOString().slice(0, 10), quantity: q, unitPrice: price, promotion: promo });
  }
  return out;
}

export function productsCsv(products = SAMPLE_PRODUCTS): string {
  const lines = products.map((p) =>
    [p.sku, p.name, p.category, p.cost.toFixed(2), p.basePrice.toFixed(2), "", "", p.inventory ?? "", p.reorderPoint ?? "", p.leadTimeDays ?? ""].join(","),
  );
  return ["sku,name,category,cost_price,current_price,min_price,max_price,inventory_qty,reorder_point,lead_time_days", ...lines].join("\n") + "\n";
}

export function salesCsvFor(sales: SampleSale[]): string {
  return ["sku,sold_at,quantity,unit_price,promotion", ...sales.map((s) => `${s.sku},${s.date},${s.quantity},${s.unitPrice.toFixed(2)},${s.promotion}`)].join("\n") + "\n";
}
