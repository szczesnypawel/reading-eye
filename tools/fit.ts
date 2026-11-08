/**
 * Fit the reading eye to the Provo training passages (1–40) by hill climbing: change one or two
 * parameters at a time, keep the change if the loss falls. Every candidate is run on the same
 * random seeds, so a change is judged on the parameters, not on luck.
 *
 * node tools/fit.ts [iterations] [runs] [fitted|ezr10 start]   → writes src/engine/fitted.ts and out/fit-log.tsv
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { EZR10, type Params } from "../src/engine/params.ts";
import { FITTED } from "../src/engine/fitted.ts";
import { score } from "../src/engine/score.ts";
import { loadLexicon, loadProvo, TRAIN } from "./load.ts";

const iters = Number(process.argv[2] ?? 300);
const runs = Number(process.argv[3] ?? 10);
const docs = loadProvo(TRAIN);
const lex = loadLexicon();

const FREE: [keyof Params, number, number][] = [
  ["alpha1", 40, 300],
  ["alpha2", 0, 15],
  ["alpha3", 0, 150],
  ["delta", 0.1, 1.5],
  ["eps", 1.0, 1.5],
  ["M1", 60, 250],
  ["pF", 0, 0.4],
  ["lambda", 0, 0.5],
  ["omega1", 5.3, 9],
  ["psi", 3, 12],
  ["eta2", 0, 0.5],
  ["sweep", 0, 6],
  ["pCorrect", 0, 1],
];

mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
const log = new URL("../out/fit-log.tsv", import.meta.url);
writeFileSync(log, "iter\tloss\tkept\tparams\n");

const from = process.argv[4] === "ezr10" ? { ...EZR10, pCorrect: 0.5 } : { ...FITTED };
let best: Params = from;
let bestLoss = score(docs, lex, best, runs).loss;
console.log(`start loss ${bestLoss.toFixed(3)}`);
let step = 0.25;
let rngState = 12345;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2147483648) / 2147483648);

for (let it = 1; it <= iters; it++) {
  const cand = { ...best };
  const n = rand() < 0.5 ? 1 : 2;
  for (let j = 0; j < n; j++) {
    const [k, lo, hi] = FREE[Math.floor(rand() * FREE.length)];
    const span = hi - lo;
    cand[k] = Math.min(hi, Math.max(lo, cand[k] + (rand() * 2 - 1) * step * span));
  }
  const loss = score(docs, lex, cand, runs).loss;
  const kept = loss < bestLoss;
  if (kept) {
    best = cand;
    bestLoss = loss;
  }
  if (it % 50 === 0) step = Math.max(0.03, step * 0.75);
  appendFileSync(log, `${it}\t${loss.toFixed(4)}\t${kept ? 1 : 0}\t${JSON.stringify(cand)}\n`);
  if (kept) console.log(`${it}\tloss ${loss.toFixed(3)}`);
}

const current = score(docs, lex, FITTED, runs).loss;
if (bestLoss >= current) {
  console.log(`final loss ${bestLoss.toFixed(3)} is not better than the current fit (${current.toFixed(3)}); fitted.ts unchanged`);
  process.exit(0);
}
const round = (v: number) => Number(v.toPrecision(4));
const body = Object.entries(best).map(([k, v]) => `  ${k}: ${round(v as number)},`).join("\n");
writeFileSync(
  new URL("../src/engine/fitted.ts", import.meta.url),
  `/**
 * Parameters fitted to the Provo Corpus training passages (1–40) by tools/fit.ts
 * (${iters} hill-climb steps, ${runs} runs per passage, training loss ${bestLoss.toFixed(3)}).
 * Passages 41–55 are held out: score them with \`node tools/score.ts fitted test\`.
 */
import type { Params } from "./params.ts";

export const FITTED: Params = {
${body}
};
`,
);
console.log(`final loss ${bestLoss.toFixed(3)}`);
