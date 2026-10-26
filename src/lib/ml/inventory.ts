/**
 * Stockout projection and reorder suggestions from a demand forecast.
 * Uses the forecast mean; safety stock uses the backtest RMSE as the per-period demand error.
 */

export interface InventoryInput {
  onHand: number;
  reorderPoint: number | null;
  leadTimeDays: number | null;
  /** Expected demand per future period, in order. */
  forecast: { key: string; mean: number }[];
  periodDays: number;
  /** Backtest RMSE per period, used for safety stock. */
  rmse: number | null;
  /** Days of demand to cover after the lead time when reordering. */
  coverDays?: number;
  /** z-score for the service level, 1.65 is roughly 95%. */
  serviceZ?: number;
}

export interface InventoryProjection {
  /** First forecast period in which cumulative demand exceeds stock, or null within the horizon. */
  stockoutPeriod: string | null;
  /** Approximate days until stockout, or null when no stockout is projected within the horizon. */
  daysOfCover: number | null;
  belowReorderPoint: boolean;
  reorder: {
    recommended: boolean;
    quantity: number;
    reason: string;
  } | null;
  /** Why no reorder suggestion could be made. */
  limitation: string | null;
}

export function projectInventory(input: InventoryInput): InventoryProjection {
  const { onHand, forecast, periodDays } = input;
  let cum = 0;
  let stockoutPeriod: string | null = null;
  let daysOfCover: number | null = null;
  for (let i = 0; i < forecast.length; i++) {
    const before = cum;
    cum += forecast[i].mean;
    if (cum > onHand && stockoutPeriod === null) {
      stockoutPeriod = forecast[i].key;
      const fraction = forecast[i].mean > 0 ? (onHand - before) / forecast[i].mean : 0;
      daysOfCover = Math.max(0, (i + fraction) * periodDays);
    }
  }
  const belowReorderPoint = input.reorderPoint !== null && onHand <= input.reorderPoint;

  if (input.leadTimeDays === null || input.leadTimeDays <= 0) {
    return {
      stockoutPeriod,
      daysOfCover,
      belowReorderPoint,
      reorder: null,
      limitation: "Set a supplier lead time on the product to get reorder suggestions.",
    };
  }
  if (forecast.length === 0) {
    return { stockoutPeriod, daysOfCover, belowReorderPoint, reorder: null, limitation: "No forecast is available." };
  }

  const perDay = forecast.reduce((s, f) => s + f.mean, 0) / (forecast.length * periodDays);
  const coverDays = input.coverDays ?? 14;
  const z = input.serviceZ ?? 1.65;
  const leadPeriods = input.leadTimeDays / periodDays;
  const safety = input.rmse !== null ? z * input.rmse * Math.sqrt(leadPeriods) : 0;
  const leadDemand = perDay * input.leadTimeDays;
  const target = perDay * (input.leadTimeDays + coverDays) + safety;
  const needs = onHand < leadDemand + safety || belowReorderPoint;
  const quantity = needs ? Math.max(0, Math.ceil(target - onHand)) : 0;
  return {
    stockoutPeriod,
    daysOfCover,
    belowReorderPoint,
    reorder: {
      recommended: needs && quantity > 0,
      quantity,
      reason: needs
        ? `Stock of ${onHand} is below expected demand over the ${input.leadTimeDays}-day lead time plus safety stock (${Math.round(leadDemand + safety)} units).`
        : `Stock covers expected demand over the ${input.leadTimeDays}-day lead time plus safety stock.`,
    },
    limitation: null,
  };
}
