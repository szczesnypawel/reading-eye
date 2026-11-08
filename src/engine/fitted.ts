/**
 * Parameters fitted to the Provo Corpus training passages (1–40) by tools/fit.ts
 * (300 hill-climb steps, 10 runs per passage, training loss 19.544).
 * Passages 41–55 are held out: score them with `node tools/score.ts fitted test`.
 */
import type { Params } from "./params.ts";

export const FITTED: Params = {
  alpha1: 105.2,
  alpha2: 3.353,
  alpha3: 77.95,
  delta: 0.1199,
  eps: 1.219,
  cv: 0.22,
  I: 25,
  pF: 0.03306,
  A: 25,
  V: 50,
  M1: 110.9,
  M2: 25,
  S: 25,
  psi: 10.19,
  omega1: 7.919,
  omega2: 3,
  eta1: 0.5,
  eta2: 0.2741,
  lambda: 0.05017,
  sweep: 2.032,
  pCorrect: 0.6355,
  scotoma: 0,
  mindless: 0,
};
