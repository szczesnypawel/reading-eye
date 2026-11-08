/**
 * Fit the reading eye with CMA-ES, all free parameters at once, in parallel worker threads.
 *
 *   passages  1–35  fitting
 *   passages 36–45  choosing between candidates (validation)
 *   passages 46–55  final score, looked at once at the end (tools/score.ts … final)
 *
 * node tools/fit_cma.ts <start: fitted|dyslexic|ezr10> [generations] [runs] [workers]
 * writes out/cma-<start>.json (best parameters, validation report, history); does not touch
 * src/engine/fitted.ts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { EZR10, type Params } from "../src/engine/params.ts";
import { READERS } from "../src/engine/readers.ts";
import { score, formatReport } from "../src/engine/score.ts";
import { cmaes } from "./cmaes.ts";
import { FIT, VALIDATION, loadLexicon, loadProvo } from "./load.ts";

const [start = "fitted", gensArg = "60", runsArg = "20", workersArg] = process.argv.slice(2);
const generations = Number(gensArg);
const runs = Number(runsArg);
const nWorkers = Number(workersArg ?? Math.max(1, availableParallelism() - 1));

/** free parameters and their allowed ranges; delta and eps kept where words still matter */
const FREE: [keyof Params, number, number][] = [
  ["alpha1", 60, 250],
  ["alpha2", 0, 10],
  ["alpha3", 0, 120],
  ["delta", 0.15, 0.6],
  ["eps", 1.1, 1.4],
  ["M1", 50, 200],
  ["pF", 0, 0.4],
  ["pN", 0, 1],
  ["lambda", 0, 0.3],
  ["psi", 3, 12],
  ["omega1", 5.3, 9],
  ["eta2", 0, 0.4],
  ["sweep", 0, 6],
  ["pCorrect", 0, 1],
];

const base: Params =
  start === "dyslexic" ? READERS.find((r) => r.id === "dyslexic")!.params
  : start === "ezr10" ? { ...EZR10, pCorrect: 0.5 }
  : READERS.find((r) => r.id === "skilled")!.params;
const toX = (p: Params) => FREE.map(([k, lo, hi]) => Math.min(1, Math.max(0, (p[k] - lo) / (hi - lo))));
const toP = (x: number[]): Params => {
  const p = { ...base };
  FREE.forEach(([k, lo, hi], i) => (p[k] = lo + x[i] * (hi - lo)));
  return p;
};

const workers = Array.from({ length: nWorkers }, () => new Worker(new URL("./fit_worker.ts", import.meta.url), { workerData: { ids: FIT, runs } }));
let jobId = 0;
const waiting = new Map<number, (v: number) => void>();
workers.forEach((w) => w.on("message", (m: { job: number; loss: number }) => { waiting.get(m.job)!(m.loss); waiting.delete(m.job); }));

let gen = 0;
async function evaluate(xs: number[][]): Promise<number[]> {
  gen++;
  // new seeds each generation, the same for every candidate within it
  return Promise.all(xs.map((x, k) => new Promise<number>((resolve) => {
    const job = ++jobId;
    waiting.set(job, resolve);
    workers[k % nWorkers].postMessage({ job, params: toP(x), seed: 1000 + gen });
  })));
}

mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
const history: { gen: number; best: number; median: number; sigma: number }[] = [];
const t0 = Date.now();
const result = await cmaes(toX(base), 0.15, evaluate, {
  generations,
  seed: 7,
  onGeneration: (s, fs) => {
    const sorted = [...fs].sort((a, b) => a - b);
    history.push({ gen: s.gen, best: sorted[0], median: sorted[Math.floor(sorted.length / 2)], sigma: s.sigma });
    if (s.gen % 5 === 0) console.log(`gen ${s.gen}  best ${sorted[0].toFixed(3)}  median ${sorted[Math.floor(sorted.length / 2)].toFixed(3)}  sigma ${s.sigma.toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  },
});
await Promise.all(workers.map((w) => w.terminate()));

// the distribution mean is the less noisy estimate of the optimum; judge it and the best sample on validation
const lex = loadLexicon();
const val = loadProvo(VALIDATION);
const candidates = { mean: toP(result.mean.map((v) => Math.min(1, Math.max(0, v)))), bestSample: toP(result.best.x) };
const reports = Object.fromEntries(Object.entries(candidates).map(([k, p]) => [k, score(val, lex, p, 100, 99)]));
const pick = reports.mean.loss <= reports.bestSample.loss ? "mean" : "bestSample";
console.log(formatReport(reports[pick], `${start} start, CMA-ES ${pick}, validation passages 36–45, 100 runs`));
writeFileSync(
  new URL(`../out/cma-${start}.json`, import.meta.url),
  JSON.stringify({ start, generations, runs, picked: pick, params: candidates[pick], validationLoss: reports[pick].loss, validation: reports[pick].measures, history }, null, 1),
);
