/**
 * Gradient-boosted regression trees with second-order (Newton) leaf updates.
 *
 * - Histogram split finding on quantile bins.
 * - Poisson loss with a log link for count demand (handles zero-sales periods),
 *   or squared error.
 * - Sparsity-aware handling of missing values (NaN) with a learned default direction.
 * - Monotone constraints per feature (XGBoost-style bound propagation).
 *
 * The model is a plain JSON-serializable object so it can be persisted as a model version.
 */

export type Loss = "poisson" | "squared";

export interface Tree {
  /** Feature index for internal nodes, -1 for leaves. */
  feature: number[];
  /** Samples with x[feature] < threshold go left. */
  threshold: number[];
  left: number[];
  right: number[];
  /** Leaf contribution (already scaled by the learning rate). */
  value: number[];
  /** Number of training samples that reached the node. */
  cover: number[];
  /** Direction for missing values. */
  defaultLeft: boolean[];
}

export interface GbdtModel {
  format: "prism-gbdt-v1";
  loss: Loss;
  baseScore: number;
  learningRate: number;
  featureNames: string[];
  trees: Tree[];
}

export interface GbdtParams {
  loss: Loss;
  nTrees: number;
  maxDepth: number;
  learningRate: number;
  /** L2 regularization on leaf weights. */
  lambda: number;
  /** Minimum split gain. */
  gamma: number;
  minChildSamples: number;
  minChildHessian: number;
  /** Clamp on |leaf weight| before learning-rate scaling (stabilizes Poisson boosting). */
  maxDeltaStep: number;
  maxBins: number;
  /** Per feature: -1 decreasing, 0 unconstrained, 1 increasing. */
  monotone?: number[];
}

export const DEFAULT_PARAMS: GbdtParams = {
  loss: "poisson",
  nTrees: 150,
  maxDepth: 4,
  learningRate: 0.05,
  lambda: 1,
  gamma: 0,
  minChildSamples: 8,
  minChildHessian: 1e-3,
  maxDeltaStep: 0.7,
  maxBins: 48,
};

interface Binned {
  /** bins[f][i] = bin index of sample i for feature f, or -1 when missing. */
  bins: Int16Array[];
  /** thresholds[f][b] = split threshold between bin b and b + 1. */
  thresholds: number[][];
}

function buildBins(X: number[][], maxBins: number): Binned {
  const n = X.length;
  const m = n === 0 ? 0 : X[0].length;
  const bins: Int16Array[] = [];
  const thresholds: number[][] = [];
  for (let f = 0; f < m; f++) {
    const values: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = X[i][f];
      if (!Number.isNaN(v)) values.push(v);
    }
    values.sort((a, b) => a - b);
    const unique: number[] = [];
    for (const v of values) if (unique.length === 0 || unique[unique.length - 1] !== v) unique.push(v);

    let cuts: number[] = [];
    if (unique.length <= maxBins) {
      for (let k = 1; k < unique.length; k++) cuts.push((unique[k - 1] + unique[k]) / 2);
    } else {
      for (let q = 1; q < maxBins; q++) {
        const idx = Math.floor((q * values.length) / maxBins);
        const lo = values[Math.max(0, idx - 1)];
        const hi = values[idx];
        const cut = lo === hi ? hi : (lo + hi) / 2;
        if (cuts.length === 0 || cut > cuts[cuts.length - 1]) cuts.push(cut);
      }
      // A cut equal to the minimum would leave an empty left bin.
      cuts = cuts.filter((c) => c > unique[0]);
    }
    thresholds.push(cuts);

    const col = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = X[i][f];
      if (Number.isNaN(v)) {
        col[i] = -1;
        continue;
      }
      // Number of cuts <= v is the bin index (binary search).
      let lo = 0;
      let hi = cuts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cuts[mid] <= v) lo = mid + 1;
        else hi = mid;
      }
      col[i] = lo;
    }
    bins.push(col);
  }
  return { bins, thresholds };
}

function leafWeight(G: number, H: number, p: GbdtParams, lo: number, hi: number): number {
  let w = -G / (H + p.lambda);
  if (p.maxDeltaStep > 0) w = Math.max(-p.maxDeltaStep, Math.min(p.maxDeltaStep, w));
  return Math.max(lo, Math.min(hi, w));
}

/** Objective reduction for a leaf with fixed weight w (valid when w is clamped). */
function leafGain(G: number, H: number, w: number, lambda: number): number {
  return -(2 * G * w + (H + lambda) * w * w);
}

interface SplitCandidate {
  gain: number;
  feature: number;
  bin: number;
  defaultLeft: boolean;
  wLeft: number;
  wRight: number;
}

export function trainGbdt(
  X: number[][],
  y: number[],
  featureNames: string[],
  params: Partial<GbdtParams> = {},
): GbdtModel {
  const p: GbdtParams = { ...DEFAULT_PARAMS, ...params };
  const n = X.length;
  if (n === 0) throw new Error("Cannot train on an empty dataset.");
  if (y.length !== n) throw new Error("Feature and target lengths differ.");
  const m = X[0].length;
  if (featureNames.length !== m) throw new Error("Feature name count does not match feature width.");
  const monotone = p.monotone ?? new Array(m).fill(0);

  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let baseScore: number;
  if (p.loss === "poisson") {
    if (y.some((v) => v < 0)) throw new Error("Poisson loss requires non-negative targets.");
    if (meanY <= 0) throw new Error("Poisson loss requires at least one positive target.");
    baseScore = Math.log(meanY);
  } else {
    baseScore = meanY;
  }

  const { bins, thresholds } = buildBins(X, p.maxBins);
  const F = new Float64Array(n).fill(baseScore);
  const g = new Float64Array(n);
  const h = new Float64Array(n);
  const trees: Tree[] = [];

  for (let t = 0; t < p.nTrees; t++) {
    for (let i = 0; i < n; i++) {
      if (p.loss === "poisson") {
        const mu = Math.exp(F[i]);
        g[i] = mu - y[i];
        h[i] = mu;
      } else {
        g[i] = F[i] - y[i];
        h[i] = 1;
      }
    }

    const tree: Tree = { feature: [], threshold: [], left: [], right: [], value: [], cover: [], defaultLeft: [] };
    const newNode = () => {
      tree.feature.push(-1);
      tree.threshold.push(0);
      tree.left.push(-1);
      tree.right.push(-1);
      tree.value.push(0);
      tree.cover.push(0);
      tree.defaultLeft.push(true);
      return tree.feature.length - 1;
    };

    const grow = (node: number, idx: Int32Array, depth: number, lo: number, hi: number) => {
      let G = 0;
      let H = 0;
      for (let k = 0; k < idx.length; k++) {
        G += g[idx[k]];
        H += h[idx[k]];
      }
      const w = leafWeight(G, H, p, lo, hi);
      tree.cover[node] = idx.length;
      tree.value[node] = p.learningRate * w;

      if (depth >= p.maxDepth || idx.length < 2 * p.minChildSamples) return;

      const parentGain = leafGain(G, H, w, p.lambda);
      let best: SplitCandidate | null = null;

      for (let f = 0; f < m; f++) {
        const nb = thresholds[f].length + 1;
        if (nb < 2) continue;
        const hg = new Float64Array(nb);
        const hh = new Float64Array(nb);
        const hc = new Int32Array(nb);
        let mg = 0;
        let mh = 0;
        let mc = 0;
        const col = bins[f];
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          const b = col[i];
          if (b < 0) {
            mg += g[i];
            mh += h[i];
            mc++;
          } else {
            hg[b] += g[i];
            hh[b] += h[i];
            hc[b]++;
          }
        }
        let lg = 0;
        let lh = 0;
        let lc = 0;
        for (let b = 0; b < nb - 1; b++) {
          lg += hg[b];
          lh += hh[b];
          lc += hc[b];
          for (const dl of mc > 0 ? [true, false] : [true]) {
            const GL = lg + (dl ? mg : 0);
            const HL = lh + (dl ? mh : 0);
            const CL = lc + (dl ? mc : 0);
            const GR = G - GL;
            const HR = H - HL;
            const CR = idx.length - CL;
            if (CL < p.minChildSamples || CR < p.minChildSamples) continue;
            if (HL < p.minChildHessian || HR < p.minChildHessian) continue;
            const wL = leafWeight(GL, HL, p, lo, hi);
            const wR = leafWeight(GR, HR, p, lo, hi);
            const c = monotone[f];
            if (c > 0 && wL > wR) continue;
            if (c < 0 && wL < wR) continue;
            const gain = leafGain(GL, HL, wL, p.lambda) + leafGain(GR, HR, wR, p.lambda) - parentGain;
            if (gain > p.gamma + 1e-12 && (best === null || gain > best.gain)) {
              best = { gain, feature: f, bin: b, defaultLeft: dl, wLeft: wL, wRight: wR };
            }
          }
        }
      }

      if (best === null) return;

      const col = bins[best.feature];
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const b = col[i];
        const goLeft = b < 0 ? best.defaultLeft : b <= best.bin;
        (goLeft ? leftIdx : rightIdx).push(i);
      }

      let lLo = lo;
      let lHi = hi;
      let rLo = lo;
      let rHi = hi;
      const c = monotone[best.feature];
      if (c !== 0) {
        const mid = (best.wLeft + best.wRight) / 2;
        if (c > 0) {
          lHi = mid;
          rLo = mid;
        } else {
          lLo = mid;
          rHi = mid;
        }
      }

      tree.feature[node] = best.feature;
      tree.threshold[node] = thresholds[best.feature][best.bin];
      tree.defaultLeft[node] = best.defaultLeft;
      const l = newNode();
      const r = newNode();
      tree.left[node] = l;
      tree.right[node] = r;
      grow(l, Int32Array.from(leftIdx), depth + 1, lLo, lHi);
      grow(r, Int32Array.from(rightIdx), depth + 1, rLo, rHi);
    };

    const root = newNode();
    const all = new Int32Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    grow(root, all, 0, -Infinity, Infinity);

    for (let i = 0; i < n; i++) F[i] += predictTree(tree, X[i]);
    trees.push(tree);
  }

  return { format: "prism-gbdt-v1", loss: p.loss, baseScore, learningRate: p.learningRate, featureNames, trees };
}

export function goesLeft(tree: Tree, node: number, x: number[]): boolean {
  const v = x[tree.feature[node]];
  return Number.isNaN(v) ? tree.defaultLeft[node] : v < tree.threshold[node];
}

export function predictTree(tree: Tree, x: number[]): number {
  let node = 0;
  while (tree.feature[node] >= 0) node = goesLeft(tree, node, x) ? tree.left[node] : tree.right[node];
  return tree.value[node];
}

/** Raw model output (log of expected demand for Poisson loss). */
export function predictMargin(model: GbdtModel, x: number[]): number {
  let s = model.baseScore;
  for (const tree of model.trees) s += predictTree(tree, x);
  return s;
}

/** Prediction on the response scale (expected demand for Poisson loss). */
export function predict(model: GbdtModel, x: number[]): number {
  const s = predictMargin(model, x);
  return model.loss === "poisson" ? Math.exp(s) : s;
}

export function isGbdtModel(value: unknown): value is GbdtModel {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { format?: unknown }).format === "prism-gbdt-v1" &&
    Array.isArray((value as { trees?: unknown }).trees)
  );
}
