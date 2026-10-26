/**
 * Exact TreeSHAP for tree ensembles (Lundberg, Erion and Lee, "Consistent Individualized
 * Feature Attribution for Tree Ensembles", Algorithm 2), using path-dependent conditional
 * expectations weighted by training-sample cover.
 *
 * Attributions are on the model's raw output scale (log expected demand for Poisson loss),
 * so for every input: expectedValue + sum(phi) === predictMargin(model, x).
 */
import { goesLeft, type GbdtModel, type Tree } from "./gbdt";

interface PathElement {
  feature: number;
  zero: number;
  one: number;
  weight: number;
}

function extendPath(path: PathElement[], zero: number, one: number, feature: number) {
  const depth = path.length;
  path.push({ feature, zero, one, weight: depth === 0 ? 1 : 0 });
  for (let i = depth - 1; i >= 0; i--) {
    path[i + 1].weight += (one * path[i].weight * (i + 1)) / (depth + 1);
    path[i].weight = (zero * path[i].weight * (depth - i)) / (depth + 1);
  }
}

function unwindPath(path: PathElement[], index: number) {
  const depth = path.length - 1;
  const { one, zero } = path[index];
  let next = path[depth].weight;
  for (let i = depth - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = path[i].weight;
      path[i].weight = (next * (depth + 1)) / ((i + 1) * one);
      next = tmp - (path[i].weight * zero * (depth - i)) / (depth + 1);
    } else {
      path[i].weight = (path[i].weight * (depth + 1)) / (zero * (depth - i));
    }
  }
  for (let i = index; i < depth; i++) {
    path[i].feature = path[i + 1].feature;
    path[i].zero = path[i + 1].zero;
    path[i].one = path[i + 1].one;
  }
  path.pop();
}

function unwoundPathSum(path: PathElement[], index: number): number {
  const depth = path.length - 1;
  const { one, zero } = path[index];
  let next = path[depth].weight;
  let total = 0;
  if (one !== 0) {
    for (let i = depth - 1; i >= 0; i--) {
      const tmp = next / ((i + 1) * one);
      total += tmp;
      next = path[i].weight - tmp * zero * (depth - i);
    }
  } else {
    for (let i = depth - 1; i >= 0; i--) total += path[i].weight / (zero * (depth - i));
  }
  return total * (depth + 1);
}

function treeShapRecursive(
  tree: Tree,
  x: number[],
  phi: number[],
  node: number,
  parentPath: PathElement[],
  zero: number,
  one: number,
  feature: number,
) {
  const path = parentPath.map((e) => ({ ...e }));
  extendPath(path, zero, one, feature);

  if (tree.feature[node] < 0) {
    for (let i = 1; i < path.length; i++) {
      const w = unwoundPathSum(path, i);
      phi[path[i].feature] += w * (path[i].one - path[i].zero) * tree.value[node];
    }
    return;
  }

  const split = tree.feature[node];
  const left = goesLeft(tree, node, x);
  const hot = left ? tree.left[node] : tree.right[node];
  const cold = left ? tree.right[node] : tree.left[node];
  const cover = tree.cover[node];

  let incomingZero = 1;
  let incomingOne = 1;
  const k = path.findIndex((e, i) => i > 0 && e.feature === split);
  if (k > 0) {
    incomingZero = path[k].zero;
    incomingOne = path[k].one;
    unwindPath(path, k);
  }
  treeShapRecursive(tree, x, phi, hot, path, (incomingZero * tree.cover[hot]) / cover, incomingOne, split);
  treeShapRecursive(tree, x, phi, cold, path, (incomingZero * tree.cover[cold]) / cover, 0, split);
}

/** Cover-weighted mean output of a tree: the expectation used by TreeSHAP. */
export function treeExpectedValue(tree: Tree, node = 0): number {
  if (tree.feature[node] < 0) return tree.value[node];
  const l = tree.left[node];
  const r = tree.right[node];
  return (tree.cover[l] * treeExpectedValue(tree, l) + tree.cover[r] * treeExpectedValue(tree, r)) / tree.cover[node];
}

export function treeShap(tree: Tree, x: number[], featureCount: number): number[] {
  const phi = new Array<number>(featureCount).fill(0);
  treeShapRecursive(tree, x, phi, 0, [], 1, 1, -1);
  return phi;
}

export interface ShapExplanation {
  expectedValue: number;
  values: number[];
  /** expectedValue + sum(values): equals the raw model output. */
  output: number;
}

export function explainModel(model: GbdtModel, x: number[]): ShapExplanation {
  const m = model.featureNames.length;
  const values = new Array<number>(m).fill(0);
  let expectedValue = model.baseScore;
  for (const tree of model.trees) {
    expectedValue += treeExpectedValue(tree);
    const phi = treeShap(tree, x, m);
    for (let f = 0; f < m; f++) values[f] += phi[f];
  }
  return { expectedValue, values, output: expectedValue + values.reduce((s, v) => s + v, 0) };
}
