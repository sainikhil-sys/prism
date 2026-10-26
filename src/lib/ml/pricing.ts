/**
 * Constrained price optimization over a candidate grid.
 *
 * For every candidate price the demand model forecasts the decision horizon with the price held
 * fixed. Expected units are capped by available inventory when that constraint is enabled. The
 * candidate with the best objective value wins; when it improves on the current price by less
 * than the hold threshold, the recommendation is to keep the current price.
 *
 * These are model estimates under the stated assumptions, not causal evidence that a price change
 * will produce the estimated outcome.
 */
import { addPeriods, FEATURE_LABELS, FEATURE_NAMES, type Period } from "./features";
import { recursiveForecast, type DemandModel, type FuturePeriod } from "./forecast";
import { predictMargin } from "./gbdt";
import { explainModel } from "./treeshap";

export type Objective = "REVENUE" | "MARGIN";

export interface PricingPolicy {
  objective: Objective;
  /** Minimum margin as a share of price, e.g. 0.15 means (price - cost) / price >= 15%. */
  minMarginPct: number;
  /** Maximum change from the current price as a share, e.g. 0.1 means +/-10%. */
  maxChangePct: number;
  /** Number of periods the decision is evaluated over. */
  decisionHorizon: number;
  respectInventory: boolean;
  /** How far beyond the observed price range candidates may go, e.g. 0.05 means 5%. */
  priceRangeExpansionPct: number;
  /** Relative objective improvement below which the current price is kept. */
  holdThresholdPct: number;
  candidateCount: number;
}

export const DEFAULT_POLICY: PricingPolicy = {
  objective: "MARGIN",
  minMarginPct: 0.1,
  maxChangePct: 0.1,
  decisionHorizon: 14,
  respectInventory: true,
  priceRangeExpansionPct: 0.05,
  holdThresholdPct: 0.005,
  candidateCount: 25,
};

export interface ProductPricingInput {
  costPrice: number;
  currentPrice: number;
  inventoryQty: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export interface CandidateEvaluation {
  price: number;
  expectedDemand: number;
  expectedUnits: number;
  revenue: number;
  margin: number;
  objective: number;
}

export interface Bound {
  value: number;
  source: string;
}

export interface FeatureContribution {
  feature: string;
  label: string;
  currentValue: number;
  recommendedValue: number;
  /** Mean SHAP value (log demand) over the decision horizon at the current price. */
  currentShap: number;
  /** Mean SHAP value (log demand) over the decision horizon at the recommended price. */
  recommendedShap: number;
}

export interface PricingExplanation {
  expectedValue: number;
  contributions: FeatureContribution[];
  /** Model-implied arc elasticity between current and recommended price, null when prices are equal. */
  arcElasticity: number | null;
  /** Largest |sum(SHAP) + base - log prediction| encountered; a correctness check on explanations. */
  additivityError: number;
}

export type PricingStatus = "RECOMMENDED" | "HOLD" | "INFEASIBLE" | "INSUFFICIENT_PRICE_VARIATION";

export interface PricingResult {
  status: PricingStatus;
  message: string;
  currentPrice: number;
  recommendedPrice: number | null;
  baseline: CandidateEvaluation;
  best: CandidateEvaluation | null;
  candidates: CandidateEvaluation[];
  lower: Bound | null;
  upper: Bound | null;
  bindingConstraints: string[];
  explanation: PricingExplanation | null;
  assumptions: string[];
}

export const MIN_DISTINCT_PRICES = 3;
export const MIN_PRICE_CV = 0.02;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function priceBounds(
  product: ProductPricingInput,
  policy: PricingPolicy,
  observed: { min: number; max: number },
): { lower: Bound; upper: Bound } {
  const lowers: Bound[] = [
    { value: product.currentPrice * (1 - policy.maxChangePct), source: "Maximum price change" },
    { value: product.costPrice / (1 - policy.minMarginPct), source: "Minimum margin" },
    { value: observed.min * (1 - policy.priceRangeExpansionPct), source: "Observed price range" },
  ];
  const uppers: Bound[] = [
    { value: product.currentPrice * (1 + policy.maxChangePct), source: "Maximum price change" },
    { value: observed.max * (1 + policy.priceRangeExpansionPct), source: "Observed price range" },
  ];
  if (product.minPrice !== null) lowers.push({ value: product.minPrice, source: "Product minimum price" });
  if (product.maxPrice !== null) uppers.push({ value: product.maxPrice, source: "Product maximum price" });
  const lower = lowers.reduce((a, b) => (b.value > a.value ? b : a));
  const upper = uppers.reduce((a, b) => (b.value < a.value ? b : a));
  // Round inward so rounded prices still satisfy every constraint.
  return {
    lower: { ...lower, value: Math.ceil(lower.value * 100 - 1e-9) / 100 },
    upper: { ...upper, value: Math.floor(upper.value * 100 + 1e-9) / 100 },
  };
}

function futurePeriods(dm: DemandModel, last: Period, price: number, horizon: number): FuturePeriod[] {
  const out: FuturePeriod[] = [];
  for (let k = 1; k <= horizon; k++) {
    out.push({
      start: addPeriods(last.start, k, dm.config.granularity),
      price,
      promo: 0,
      competitorPrice: last.competitorPrice,
    });
  }
  return out;
}

export function evaluatePrice(
  dm: DemandModel,
  periods: Period[],
  product: ProductPricingInput,
  policy: PricingPolicy,
  price: number,
): CandidateEvaluation & { features: number[][] } {
  const history = periods.map((p) => p.units);
  const fc = recursiveForecast(dm, history, futurePeriods(dm, periods[periods.length - 1], price, policy.decisionHorizon));
  const expectedDemand = fc.mean.reduce((s, v) => s + v, 0);
  const cap = policy.respectInventory && product.inventoryQty !== null ? Math.max(0, product.inventoryQty) : Infinity;
  const expectedUnits = Math.min(expectedDemand, cap);
  const revenue = price * expectedUnits;
  const margin = (price - product.costPrice) * expectedUnits;
  return {
    price,
    expectedDemand,
    expectedUnits,
    revenue,
    margin,
    objective: policy.objective === "REVENUE" ? revenue : margin,
    features: fc.features,
  };
}

function meanShap(dm: DemandModel, features: number[][]): { expectedValue: number; values: number[]; maxErr: number } {
  const m = dm.model.featureNames.length;
  const values = new Array<number>(m).fill(0);
  let expectedValue = 0;
  let maxErr = 0;
  for (const x of features) {
    const e = explainModel(dm.model, x);
    expectedValue = e.expectedValue;
    for (let f = 0; f < m; f++) values[f] += e.values[f] / features.length;
    maxErr = Math.max(maxErr, Math.abs(e.output - predictMargin(dm.model, x)));
  }
  return { expectedValue, values, maxErr };
}

function strip(e: CandidateEvaluation & { features?: number[][] }): CandidateEvaluation {
  return {
    price: e.price,
    expectedDemand: e.expectedDemand,
    expectedUnits: e.expectedUnits,
    revenue: e.revenue,
    margin: e.margin,
    objective: e.objective,
  };
}

export function optimizePrice(
  dm: DemandModel,
  periods: Period[],
  product: ProductPricingInput,
  policy: PricingPolicy,
): PricingResult {
  const assumptions = [
    `Demand is estimated by model trained on ${dm.trainedFrom} to ${dm.trainedTo} (${dm.trainRows} periods).`,
    `The price is held fixed for the next ${policy.decisionHorizon} ${dm.config.granularity === "DAILY" ? "days" : "weeks"} with no promotion.`,
    "Competitor prices stay at their latest observed level.",
    policy.respectInventory && product.inventoryQty !== null
      ? `Units sold cannot exceed the ${product.inventoryQty} units currently in stock.`
      : "Inventory is not treated as a constraint.",
    "Estimates come from historical correlations captured by the model. They are not causal evidence; validate material changes with a controlled test.",
  ];

  const baselineFull = evaluatePrice(dm, periods, product, policy, product.currentPrice);
  const baseline = strip(baselineFull);
  const empty = {
    currentPrice: product.currentPrice,
    recommendedPrice: null,
    baseline,
    best: null,
    candidates: [] as CandidateEvaluation[],
    bindingConstraints: [] as string[],
    explanation: null,
    assumptions,
  };

  const ps = dm.priceStats;
  if (ps.distinct < MIN_DISTINCT_PRICES || ps.cv < MIN_PRICE_CV) {
    return {
      ...empty,
      status: "INSUFFICIENT_PRICE_VARIATION",
      message: `Only ${ps.distinct} distinct price${ps.distinct === 1 ? "" : "s"} appear in the sales history (variation ${(ps.cv * 100).toFixed(1)}%). The model cannot estimate how demand responds to price, so no recommendation was made. Collect sales at a few different price points first.`,
      lower: null,
      upper: null,
    };
  }

  const { lower, upper } = priceBounds(product, policy, ps);
  if (lower.value > upper.value) {
    return {
      ...empty,
      status: "INFEASIBLE",
      message: `No price satisfies every rule: the lowest allowed price is ${lower.value.toFixed(2)} (${lower.source}) but the highest allowed is ${upper.value.toFixed(2)} (${upper.source}). Adjust the pricing policy or product limits.`,
      lower,
      upper,
    };
  }

  const prices = new Set<number>();
  const count = Math.max(2, policy.candidateCount);
  for (let i = 0; i < count; i++) prices.add(round2(lower.value + ((upper.value - lower.value) * i) / (count - 1)));
  if (product.currentPrice >= lower.value && product.currentPrice <= upper.value) prices.add(round2(product.currentPrice));
  const evaluated = [...prices]
    .sort((a, b) => a - b)
    .map((p) => (p === round2(product.currentPrice) ? baselineFull : evaluatePrice(dm, periods, product, policy, p)));

  let best = evaluated[0];
  for (const e of evaluated) {
    const better = e.objective > best.objective + 1e-9;
    const tie = Math.abs(e.objective - best.objective) <= 1e-9;
    if (better || (tie && Math.abs(e.price - product.currentPrice) < Math.abs(best.price - product.currentPrice))) best = e;
  }

  const currentFeasible = product.currentPrice >= lower.value && product.currentPrice <= upper.value;
  const improvement = baseline.objective !== 0 ? (best.objective - baseline.objective) / Math.abs(baseline.objective) : Infinity;
  const hold = currentFeasible && improvement < policy.holdThresholdPct;
  const chosen = hold ? baselineFull : best;

  const binding: string[] = [];
  if (Math.abs(chosen.price - lower.value) < 0.005) binding.push(`Lower bound: ${lower.source}`);
  if (Math.abs(chosen.price - upper.value) < 0.005) binding.push(`Upper bound: ${upper.source}`);
  if (policy.respectInventory && product.inventoryQty !== null && chosen.expectedDemand > product.inventoryQty) {
    binding.push("Inventory limits expected sales");
  }

  const cur = meanShap(dm, baselineFull.features);
  const rec = meanShap(dm, chosen.features);
  const avg = (rows: number[][], f: number) => rows.reduce((s, r) => s + r[f], 0) / rows.length;
  const contributions: FeatureContribution[] = FEATURE_NAMES.map((name, f) => ({
    feature: name,
    label: FEATURE_LABELS[name],
    currentValue: avg(baselineFull.features, f),
    recommendedValue: avg(chosen.features, f),
    currentShap: cur.values[f],
    recommendedShap: rec.values[f],
  })).sort((a, b) => Math.max(Math.abs(b.currentShap), Math.abs(b.recommendedShap)) - Math.max(Math.abs(a.currentShap), Math.abs(a.recommendedShap)));

  const p0 = product.currentPrice;
  const p1 = chosen.price;
  const d0 = baseline.expectedDemand;
  const d1 = chosen.expectedDemand;
  const arcElasticity =
    Math.abs(p1 - p0) < 0.005 || d0 + d1 === 0 ? null : ((d1 - d0) / ((d1 + d0) / 2)) / ((p1 - p0) / ((p1 + p0) / 2));

  const unitWord = dm.config.granularity === "DAILY" ? "days" : "weeks";
  const objectiveWord = policy.objective === "REVENUE" ? "revenue" : "contribution margin";
  let message: string;
  if (hold) {
    message = `Keep the current price. The best candidate (${best.price.toFixed(2)}) improves estimated ${objectiveWord} by ${(Math.max(0, improvement) * 100).toFixed(2)}%, below the ${(policy.holdThresholdPct * 100).toFixed(2)}% threshold.`;
  } else if (!currentFeasible) {
    message = `The current price breaks the pricing policy. ${chosen.price.toFixed(2)} is the best allowed price over the next ${policy.decisionHorizon} ${unitWord}.`;
  } else {
    message = `${chosen.price.toFixed(2)} has the highest estimated ${objectiveWord} over the next ${policy.decisionHorizon} ${unitWord}, ${(improvement * 100).toFixed(1)}% above the current price.`;
  }

  return {
    status: hold ? "HOLD" : "RECOMMENDED",
    message,
    currentPrice: product.currentPrice,
    recommendedPrice: chosen.price,
    baseline,
    best: strip(chosen),
    candidates: evaluated.map(strip),
    lower,
    upper,
    bindingConstraints: binding,
    explanation: {
      expectedValue: cur.expectedValue,
      contributions,
      arcElasticity,
      additivityError: Math.max(cur.maxErr, rec.maxErr),
    },
    assumptions,
  };
}
