import { describe, expect, it } from "vitest";
import { goesLeft, predictMargin, trainGbdt, type Tree } from "@/lib/ml/gbdt";
import { explainModel, treeExpectedValue, treeShap } from "@/lib/ml/treeshap";

/** Deterministic PRNG so tests are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Path-dependent conditional expectation E[f(x) | x_S] used by TreeSHAP. */
function conditional(tree: Tree, x: number[], S: Set<number>, node = 0): number {
  if (tree.feature[node] < 0) return tree.value[node];
  if (S.has(tree.feature[node])) {
    return conditional(tree, x, S, goesLeft(tree, node, x) ? tree.left[node] : tree.right[node]);
  }
  const l = tree.left[node];
  const r = tree.right[node];
  return (tree.cover[l] * conditional(tree, x, S, l) + tree.cover[r] * conditional(tree, x, S, r)) / tree.cover[node];
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/** Exact Shapley values by enumerating every coalition. */
function bruteForceShap(tree: Tree, x: number[], m: number): number[] {
  const phi = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    const others = [...Array(m).keys()].filter((j) => j !== i);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      const S = new Set(others.filter((_, k) => mask & (1 << k)));
      const weight = (factorial(S.size) * factorial(m - S.size - 1)) / factorial(m);
      const withI = new Set(S);
      withI.add(i);
      phi[i] += weight * (conditional(tree, x, withI) - conditional(tree, x, S));
    }
  }
  return phi;
}

function dataset(n: number, m: number, seed: number) {
  const r = rng(seed);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = Array.from({ length: m }, () => r() * 10);
    // Interaction and repeated use of feature 0 so paths split on the same feature twice.
    const signal = 2 + Math.sin(row[0]) + (row[1] > 5 ? 1.5 : 0) * (row[2] > 3 ? 1 : 0.2) + 0.1 * row[3];
    X.push(row);
    y.push(Math.max(0, Math.round(signal + (r() - 0.5))));
  }
  return { X, y };
}

describe("TreeSHAP", () => {
  const m = 5;
  const { X, y } = dataset(300, m, 7);
  const model = trainGbdt(X, y, ["a", "b", "c", "d", "e"], { nTrees: 20, maxDepth: 5, minChildSamples: 5 });

  it("matches brute-force Shapley values for every tree", () => {
    const r = rng(99);
    for (let trial = 0; trial < 10; trial++) {
      const x = Array.from({ length: m }, () => r() * 10);
      for (const tree of model.trees.slice(0, 8)) {
        const fast = treeShap(tree, x, m);
        const slow = bruteForceShap(tree, x, m);
        for (let f = 0; f < m; f++) expect(fast[f]).toBeCloseTo(slow[f], 10);
      }
    }
  });

  it("is additive: expected value plus attributions equals the raw prediction", () => {
    for (const x of X.slice(0, 50)) {
      const e = explainModel(model, x);
      expect(e.output).toBeCloseTo(predictMargin(model, x), 9);
    }
  });

  it("handles missing values using the learned default direction", () => {
    const x = [Number.NaN, 7, 4, 1, 2];
    const e = explainModel(model, x);
    expect(e.output).toBeCloseTo(predictMargin(model, x), 9);
    for (const tree of model.trees.slice(0, 5)) {
      const fast = treeShap(tree, x, m);
      const slow = bruteForceShap(tree, x, m);
      for (let f = 0; f < m; f++) expect(fast[f]).toBeCloseTo(slow[f], 10);
    }
  });

  it("gives zero attribution to a feature the trees never use", () => {
    const X2 = X.map((row) => [...row.slice(0, 4), 0]);
    const model2 = trainGbdt(X2, y, ["a", "b", "c", "d", "constant"], { nTrees: 10 });
    const e = explainModel(model2, [1, 2, 3, 4, 0]);
    expect(e.values[4]).toBe(0);
  });

  it("uses the cover-weighted mean as the expected value", () => {
    const tree = model.trees[0];
    const total = X.reduce((s, x) => {
      let node = 0;
      while (tree.feature[node] >= 0) node = goesLeft(tree, node, x) ? tree.left[node] : tree.right[node];
      return s + tree.value[node];
    }, 0);
    expect(treeExpectedValue(tree)).toBeCloseTo(total / X.length, 9);
  });
});
