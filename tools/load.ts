/** Load the prepared Provo data and lexicon from public/data (for the command-line tools). */
import { readFileSync } from "node:fs";
import type { Lexicon, ProvoDoc } from "../src/engine/text.ts";

const DATA = new URL("../public/data/", import.meta.url);

export function loadLexicon(): Lexicon {
  return JSON.parse(readFileSync(new URL("lexicon.json", DATA), "utf8"));
}

export function loadProvo(ids?: number[]): ProvoDoc[] {
  const index: { id: number }[] = JSON.parse(readFileSync(new URL("provo/index.json", DATA), "utf8"));
  return index
    .filter((t) => !ids || ids.includes(t.id))
    .map((t) => JSON.parse(readFileSync(new URL(`provo/text${String(t.id).padStart(2, "0")}.json`, DATA), "utf8")));
}

/** passages 1–40 for fitting, 41–55 held out (the split used by tools/fit.ts) */
export const TRAIN = Array.from({ length: 40 }, (_, i) => i + 1);
export const TEST = Array.from({ length: 15 }, (_, i) => i + 41);

/** the split used by tools/fit_cma.ts: fit 1–35, choose on 36–45, final score once on 46–55 */
export const FIT = Array.from({ length: 35 }, (_, i) => i + 1);
export const VALIDATION = Array.from({ length: 10 }, (_, i) => i + 36);
export const FINAL = Array.from({ length: 10 }, (_, i) => i + 46);
