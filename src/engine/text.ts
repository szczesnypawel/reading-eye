/**
 * A page of text as the eye sees it: words on lines, measured in character spaces. A word's
 * region includes the space after it (as in the Provo interest areas).
 */
export interface Word {
  text: string;
  /** line index and start column (character spaces from the line's left edge) */
  line: number;
  col: number;
  len: number;
  zipf: number;
  pred: number;
  /** true if `pred` is a measured cloze score, false if it is a guess */
  predMeasured: boolean;
}

export interface Page {
  words: Word[];
  /** pixel geometry, so a page from an eye-tracking study lines up with its real fixations */
  ppc: number;
  lineLeft: number[];
  lineY: number[];
  lineHeight: number;
}

export interface Lexicon {
  zipf: Record<string, number>;
  predByClass: Record<string, number>;
  predByWord: Record<string, number>;
}

export const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

/** frequency per million from the Zipf scale; unknown words get a floor */
export const lnFreqPerMillion = (zipf: number) => (Math.max(zipf, 1) - 3) * Math.LN10;

export function lookup(lex: Lexicon, w: string): { zipf: number; pred: number } {
  const c = cleanWord(w);
  const zipf = lex.zipf[c] ?? 1;
  const pred = lex.predByWord[c] ?? (zipf >= 5.5 ? lex.predByClass.Function : lex.predByClass.Content);
  return { zipf, pred };
}

/** Lay out any typed text in a monospace grid of `width` characters. */
export function pageFromText(text: string, lex: Lexicon, width = 72): Page {
  const words: Word[] = [];
  let line = 0;
  let col = 0;
  for (const para of text.split(/\n\s*\n/)) {
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (col > 0 && col + w.length > width) {
        line++;
        col = 0;
      }
      const { zipf, pred } = lookup(lex, w);
      words.push({ text: w, line, col, len: w.length, zipf, pred, predMeasured: false });
      col += w.length + 1;
    }
    if (col > 0) {
      line += 2;
      col = 0;
    }
  }
  const nLines = (words.at(-1)?.line ?? 0) + 1;
  return {
    words,
    ppc: 12,
    lineLeft: Array(nLines).fill(60),
    lineY: Array.from({ length: nLines }, (_, i) => 60 + i * 46),
    lineHeight: 46,
  };
}

/** Provo text file as written by scripts/prep_provo.py */
export interface ProvoDoc {
  id: number;
  ppc: number;
  lineTops: number[];
  measures: string[];
  words: {
    w: string;
    box: [number, number, number, number];
    line: number;
    zipf: number;
    pred: number | null;
    human: Record<string, number | null>;
    halves: (number | null)[][];
  }[];
  readers: { id: string; fix: [number, number, number, number][] }[];
}

export function pageFromProvo(doc: ProvoDoc, lex: Lexicon): Page {
  const ppc = doc.ppc;
  // a line's first box carries the left margin, so anchor it on its right edge
  const start = doc.words.map((w, i) => {
    const first = i === 0 || doc.words[i - 1].line !== w.line;
    return first ? w.box[2] - ppc * (w.w.length + 1) : w.box[0];
  });
  const lineLeft = doc.lineTops.map((_, li) => start[doc.words.findIndex((w) => w.line === li)]);
  const words = doc.words.map((w, i) => {
    const guess = lookup(lex, w.w);
    return {
      text: w.w,
      line: w.line,
      col: (start[i] - lineLeft[w.line]) / ppc,
      len: w.w.length,
      zipf: w.zipf || 1,
      pred: w.pred ?? guess.pred,
      predMeasured: w.pred !== null,
    };
  });
  const h = doc.words[0].box[3] - doc.words[0].box[1];
  return {
    words,
    ppc,
    lineLeft,
    lineY: doc.lineTops.map((t) => t + h / 2),
    lineHeight: h,
  };
}

/** Which word a position (line, column) falls in; -1 if none. */
export function wordAt(page: Page, line: number, col: number): number {
  let best = -1;
  for (let i = 0; i < page.words.length; i++) {
    const w = page.words[i];
    if (w.line !== line) continue;
    if (col >= w.col - 0.5 && col < w.col + w.len + 0.5) return i;
    if (col >= w.col) best = i;
  }
  if (best === -1) {
    const first = page.words.findIndex((w) => w.line === line);
    return first;
  }
  return best;
}

/** Map a real fixation in pixels onto the page. */
export function pxToPos(page: Page, x: number, y: number): { line: number; col: number } {
  let line = 0;
  let d = Infinity;
  page.lineY.forEach((ly, i) => {
    if (Math.abs(y - ly) < d) {
      d = Math.abs(y - ly);
      line = i;
    }
  });
  return { line, col: (x - page.lineLeft[line]) / page.ppc };
}

export const posToPx = (page: Page, line: number, col: number) => ({
  x: page.lineLeft[line] + col * page.ppc,
  y: page.lineY[line],
});
