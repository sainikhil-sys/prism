export interface ErrorMetrics {
  /** Mean absolute error, in units. */
  mae: number;
  /** Root mean squared error, in units. */
  rmse: number;
  /** Weighted absolute percentage error: sum|e| / sum(actual). Null when actual demand is zero. */
  wape: number | null;
  /** Mean of (forecast - actual). Positive means over-forecasting. */
  bias: number;
  /** MAE scaled by the in-sample naive MAE. Below 1 beats the naive method. Null when undefined. */
  mase: number | null;
  n: number;
}

export function errorMetrics(actual: number[], forecast: number[], naiveScale: number | null): ErrorMetrics {
  if (actual.length !== forecast.length) throw new Error("Actual and forecast lengths differ.");
  const n = actual.length;
  if (n === 0) return { mae: 0, rmse: 0, wape: null, bias: 0, mase: null, n: 0 };
  let abs = 0;
  let sq = 0;
  let err = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const e = forecast[i] - actual[i];
    abs += Math.abs(e);
    sq += e * e;
    err += e;
    total += actual[i];
  }
  const mae = abs / n;
  return {
    mae,
    rmse: Math.sqrt(sq / n),
    wape: total > 0 ? abs / total : null,
    bias: err / n,
    mase: naiveScale && naiveScale > 0 ? mae / naiveScale : null,
    n,
  };
}

/** In-sample MAE of the seasonal naive method with season length m. */
export function naiveScale(train: number[], m: number): number | null {
  if (train.length <= m) return null;
  let s = 0;
  for (let i = m; i < train.length; i++) s += Math.abs(train[i] - train[i - m]);
  return s / (train.length - m);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
