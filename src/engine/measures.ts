/**
 * Standard per-word reading measures from a fixation sequence. Definitions match the Provo
 * interest-area report as used in scripts/prep_provo.py:
 *   skip   — the word got no fixation before a later word was fixated (first pass)
 *   ffd    — first fixation duration, first pass only
 *   gd     — gaze duration: sum of the first run of fixations, first pass only
 *   tt     — total time on the word, if fixated at all
 *   refix  — the first run has more than one fixation (first pass only)
 *   regout — the first run ended with a move to an earlier word (first pass only)
 */
export const MEASURES = ["skip", "ffd", "gd", "tt", "refix", "regout"] as const;
export type Measure = (typeof MEASURES)[number];
export type WordMeasures = Record<Measure, number | null>;

export interface Fix {
  word: number;
  dur: number;
}

export function wordMeasures(fix: Fix[], nWords: number): WordMeasures[] {
  const out: WordMeasures[] = [];
  for (let w = 0; w < nWords; w++) {
    const first = fix.findIndex((f) => f.word === w);
    let maxBefore = -1;
    for (let i = 0; i < (first === -1 ? fix.length : first); i++) maxBefore = Math.max(maxBefore, fix[i].word);
    const firstPass = first !== -1 && maxBefore < w;
    const m: WordMeasures = { skip: firstPass ? 0 : 1, ffd: null, gd: null, tt: null, refix: null, regout: null };
    if (first !== -1) m.tt = fix.filter((f) => f.word === w).reduce((s, f) => s + f.dur, 0);
    if (firstPass) {
      let i = first;
      let gd = 0;
      while (i < fix.length && fix[i].word === w) gd += fix[i++].dur;
      m.ffd = fix[first].dur;
      m.gd = gd;
      m.refix = i - first > 1 ? 1 : 0;
      m.regout = i < fix.length && fix[i].word < w ? 1 : 0;
    }
    out.push(m);
  }
  return out;
}

/** mean of each measure over many runs (null-aware) */
export function meanMeasures(runs: WordMeasures[][], nWords: number): WordMeasures[] {
  const out: WordMeasures[] = [];
  for (let w = 0; w < nWords; w++) {
    const m = {} as WordMeasures;
    for (const k of MEASURES) {
      let s = 0;
      let n = 0;
      for (const r of runs) {
        const v = r[w][k];
        if (v !== null) {
          s += v;
          n++;
        }
      }
      m[k] = n ? s / n : null;
    }
    out.push(m);
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}
