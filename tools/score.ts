/**
 * node tools/score.ts [ezr10|fitted] [train|test|all] [runs]
 * node tools/score.ts check-humans   — recompute the human measures from the raw fixations
 */
import { MEASURES, meanMeasures, pearson, wordMeasures } from "../src/engine/measures.ts";
import { EZR10, type Params } from "../src/engine/params.ts";
import { formatReport, humanFixations, score } from "../src/engine/score.ts";
import { FITTED } from "../src/engine/fitted.ts";
import { loadLexicon, loadProvo, TEST, TRAIN } from "./load.ts";

const [which = "fitted", split = "test", runsArg = "40"] = process.argv.slice(2);

if (which === "check-humans") {
  // our measure code on the raw fixations should reproduce the study's interest-area report
  const docs = loadProvo();
  for (const m of MEASURES) {
    const a: number[] = [], b: number[] = [];
    for (const doc of docs) {
      const runs = doc.readers.map((r) => wordMeasures(humanFixations(doc, r), doc.words.length));
      const mine = meanMeasures(runs, doc.words.length);
      doc.words.forEach((w, i) => {
        if (i > 0 && w.human[m] !== null && mine[i][m] !== null) {
          a.push(w.human[m]!);
          b.push(mine[i][m]!);
        }
      });
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    console.log(`${m.padEnd(7)} report ${mean(a).toFixed(3)}  ours ${mean(b).toFixed(3)}  r ${pearson(a, b).toFixed(3)}`);
  }
  process.exit(0);
}

const p: Params = which === "ezr10" ? EZR10 : FITTED;
const ids = split === "train" ? TRAIN : split === "test" ? TEST : undefined;
const t0 = Date.now();
const rep = score(loadProvo(ids), loadLexicon(), p, Number(runsArg));
console.log(formatReport(rep, `${which} on ${split} passages, ${runsArg} runs each`));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
