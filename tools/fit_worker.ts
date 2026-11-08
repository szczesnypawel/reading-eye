/** Worker thread for tools/fit_cma.ts: scores parameter sets on the fitting passages. */
import { parentPort, workerData } from "node:worker_threads";
import type { Params } from "../src/engine/params.ts";
import { score } from "../src/engine/score.ts";
import { loadLexicon, loadProvo } from "./load.ts";

const { ids, runs } = workerData as { ids: number[]; runs: number };
const docs = loadProvo(ids);
const lex = loadLexicon();

parentPort!.on("message", (m: { job: number; params: Params; seed: number }) => {
  const rep = score(docs, lex, m.params, runs, m.seed);
  parentPort!.postMessage({ job: m.job, loss: rep.loss });
});
