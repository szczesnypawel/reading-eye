/**
 * A small CMA-ES (covariance matrix adaptation evolution strategy, Hansen 2016, "The CMA
 * Evolution Strategy: A Tutorial"), for minimising a noisy loss over a box [0, 1]^n.
 * Unlike a hill climb it moves all parameters together and learns which directions pay off.
 */
import { Rng } from "../src/engine/rng.ts";

export interface CmaState {
  gen: number;
  mean: number[];
  sigma: number;
  best: { x: number[]; f: number };
}

export async function cmaes(
  x0: number[],
  sigma0: number,
  evaluate: (xs: number[][]) => Promise<number[]>,
  opts: { generations: number; seed?: number; onGeneration?: (s: CmaState, fs: number[]) => void },
): Promise<CmaState> {
  const n = x0.length;
  const rng = new Rng(opts.seed ?? 1);
  const lambda = 4 + Math.floor(3 * Math.log(n));
  const mu = Math.floor(lambda / 2);
  let w = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const ws = w.reduce((a, b) => a + b, 0);
  w = w.map((v) => v / ws);
  const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
  const cs = (mueff + 2) / (n + mueff + 5);
  const c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

  let mean = [...x0];
  let sigma = sigma0;
  const pc = Array(n).fill(0);
  const ps = Array(n).fill(0);
  let C = eye(n);
  let B = eye(n);
  let D = Array(n).fill(1);
  let evals = 0;
  const state: CmaState = { gen: 0, mean, sigma, best: { x: [...x0], f: Infinity } };

  for (let g = 1; g <= opts.generations; g++) {
    // sample
    const zs: number[][] = [];
    const ys: number[][] = [];
    const xs: number[][] = [];
    for (let k = 0; k < lambda; k++) {
      const z = Array.from({ length: n }, () => rng.normal());
      const y = matVec(B, z.map((v, i) => v * D[i]));
      zs.push(z);
      ys.push(y);
      xs.push(mean.map((m, i) => m + sigma * y[i]));
    }
    // evaluate inside the box; outside it, clip and add a penalty for the distance
    const clipped = xs.map((x) => x.map((v) => Math.min(1, Math.max(0, v))));
    const raw = await evaluate(clipped);
    const fs = raw.map((f, k) => f + 10 * xs[k].reduce((s, v, i) => s + (v - clipped[k][i]) ** 2, 0));
    evals += lambda;
    const order = fs.map((f, k) => [f, k] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    if (fs[order[0]] < state.best.f) state.best = { x: clipped[order[0]], f: fs[order[0]] };

    // recombine
    const old = mean;
    mean = Array(n).fill(0);
    for (let i = 0; i < mu; i++) for (let d = 0; d < n; d++) mean[d] += w[i] * xs[order[i]][d];
    const step = mean.map((m, d) => (m - old[d]) / sigma);

    // evolution paths
    const invsqrtCstep = matVec(B, matVec(transpose(B), step).map((v, i) => v / D[i]));
    for (let d = 0; d < n; d++) ps[d] = (1 - cs) * ps[d] + Math.sqrt(cs * (2 - cs) * mueff) * invsqrtCstep[d];
    const psn = Math.hypot(...ps);
    const hsig = psn / Math.sqrt(1 - (1 - cs) ** ((2 * evals) / lambda)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    for (let d = 0; d < n; d++) pc[d] = (1 - cc) * pc[d] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * step[d];

    // covariance
    const Cn = C.map((row, i) => row.map((v, j) => (1 - c1 - cmu) * v + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * v)));
    for (let k = 0; k < mu; k++) {
      const a = xs[order[k]].map((v, d) => (v - old[d]) / sigma);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Cn[i][j] += cmu * w[k] * a[i] * a[j];
    }
    C = Cn;
    sigma *= Math.exp((cs / damps) * (psn / chiN - 1));
    const eig = jacobiEigen(C);
    B = eig.vectors;
    D = eig.values.map((v) => Math.sqrt(Math.max(v, 1e-20)));

    state.gen = g;
    state.mean = mean;
    state.sigma = sigma;
    opts.onGeneration?.(state, fs);
    void zs;
    void ys;
  }
  return state;
}

const eye = (n: number): number[][] => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const transpose = (M: number[][]) => M[0].map((_, j) => M.map((r) => r[j]));
const matVec = (M: number[][], v: number[]) => M.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));

/** eigen-decomposition of a symmetric matrix (cyclic Jacobi); columns of `vectors` are eigenvectors */
function jacobiEigen(S: number[][]) {
  const n = S.length;
  const A = S.map((r) => [...r]);
  const V = eye(n);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}
