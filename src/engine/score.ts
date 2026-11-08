/**
 * Score the reading eye against real readers (the Provo Corpus): run the model many times on
 * each passage and compare its per-word measures with the human means, word by word.
 * Shared by the command line (tools/) and the page.
 */
import { MEASURES, meanMeasures, pearson, wordMeasures, type Fix, type Measure, type WordMeasures } from "./measures.ts";
import { Reader } from "./model.ts";
import type { Params } from "./params.ts";
import { pageFromProvo, type Lexicon, type ProvoDoc } from "./text.ts";

export function simulate(doc: ProvoDoc, lex: Lexicon, p: Params, runs: number, seed = 1): WordMeasures[] {
  const page = pageFromProvo(doc, lex);
  const all: WordMeasures[][] = [];
  for (let r = 0; r < runs; r++) {
    const rd = new Reader(page, p, seed * 7919 + r * 104729 + doc.id);
    const fx = rd.run();
    all.push(wordMeasures(fx.map((f) => ({ word: f.word, dur: (f.end ?? rd.t) - f.start })), page.words.length));
  }
  return meanMeasures(all, page.words.length);
}

/** a real reader's fixations, mapped onto words by the study's interest-area boxes */
export function humanFixations(doc: ProvoDoc, reader: ProvoDoc["readers"][number]): Fix[] {
  const out: Fix[] = [];
  for (const [x, y, , dur] of reader.fix) {
    const w = doc.words.findIndex((wd) => x >= wd.box[0] && x < wd.box[2] && y >= wd.box[1] && y < wd.box[3]);
    if (w !== -1) out.push({ word: w, dur });
  }
  return out;
}

export interface Report {
  measures: Record<Measure, { human: number; model: number; r: number; ceiling: number; n: number }>;
  loss: number;
  byFreq: { bin: string; n: number; human: Record<Measure, number>; model: Record<Measure, number> }[];
}

/** weight of per-word correlation against the error in means, in the loss */
export const R_WEIGHT = 4;

const SCALE: Record<Measure, number> = { skip: 0.1, ffd: 20, gd: 30, tt: 40, refix: 0.05, regout: 0.05 };

export function score(docs: ProvoDoc[], lex: Lexicon, p: Params, runs: number, seed = 1): Report {
  const rows: { zipf: number; human: Record<string, number | null>; halves: (number | null)[][]; model: WordMeasures }[] = [];
  for (const doc of docs) {
    const model = simulate(doc, lex, p, runs, seed);
    doc.words.forEach((w, i) => {
      // the first word of a passage is read from a fixation cross; leave it out, as is usual
      if (i === 0) return;
      rows.push({ zipf: w.zipf, human: w.human, halves: w.halves, model: model[i] });
    });
  }
  const measures = {} as Report["measures"];
  let loss = 0;
  MEASURES.forEach((m, mi) => {
    const ok = rows.filter((r) => r.human[m] !== null && r.model[m] !== null);
    const h = ok.map((r) => r.human[m]!);
    const md = ok.map((r) => r.model[m]!);
    const hv = rows.filter((r) => r.halves[0][mi] !== null && r.halves[1][mi] !== null);
    const split = pearson(hv.map((r) => r.halves[0][mi]!), hv.map((r) => r.halves[1][mi]!));
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const e = { human: mean(h), model: mean(md), r: pearson(h, md), ceiling: (2 * split) / (1 + split), n: ok.length };
    measures[m] = e;
    loss += ((e.model - e.human) / SCALE[m]) ** 2 + R_WEIGHT * (1 - (Number.isFinite(e.r) ? e.r : 0));
  });
  const bins = [[0, 3], [3, 4], [4, 5], [5, 6], [6, 9]];
  const byFreq = bins.map(([lo, hi]) => {
    const inBin = rows.filter((r) => r.zipf >= lo && r.zipf < hi);
    const avg = (pick: (r: (typeof rows)[number]) => number | null) => {
      const v = inBin.map(pick).filter((x): x is number => x !== null);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
    };
    const human = {} as Record<Measure, number>;
    const model = {} as Record<Measure, number>;
    for (const m of MEASURES) {
      human[m] = avg((r) => r.human[m]);
      model[m] = avg((r) => r.model[m]);
    }
    return { bin: `zipf ${lo}–${hi}`, n: inBin.length, human, model };
  });
  return { measures, loss, byFreq };
}

export function formatReport(rep: Report, title: string): string {
  const f = (m: Measure, v: number) => (["skip", "refix", "regout"].includes(m) ? v.toFixed(3) : v.toFixed(0));
  const lines = [`## ${title}`, "", `loss ${rep.loss.toFixed(3)}`, "", "| measure | human | model | r (per word) | ceiling | words |", "|---|---|---|---|---|---|"];
  for (const m of MEASURES) {
    const e = rep.measures[m];
    lines.push(`| ${m} | ${f(m, e.human)} | ${f(m, e.model)} | ${e.r.toFixed(3)} | ${e.ceiling.toFixed(3)} | ${e.n} |`);
  }
  lines.push("", "| frequency | words | skip human | skip model | gd human | gd model |", "|---|---|---|---|---|---|");
  for (const b of rep.byFreq) {
    lines.push(`| ${b.bin} | ${b.n} | ${b.human.skip.toFixed(3)} | ${b.model.skip.toFixed(3)} | ${b.human.gd.toFixed(0)} | ${b.model.gd.toFixed(0)} |`);
  }
  return lines.join("\n");
}
