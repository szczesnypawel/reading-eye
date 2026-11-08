/**
 * Parameters fitted to the Provo Corpus training passages (1–40) by tools/fit.ts
 * (400 hill-climb steps, 10 runs per passage, training loss 20.372).
 * Passages 41–55 are held out: score them with `node tools/score.ts fitted test`.
 */
import type { Params } from "./params.ts";

export const FITTED: Params = {
  alpha1: 88.39,
  alpha2: 2,
  alpha3: 48.57,
  delta: 0.1873,
  eps: 1.08,
  cv: 0.22,
  I: 25,
  pF: 0.245,
  A: 50,
  pN: 0.3557,
  regExtra: 30,
  V: 50,
  M1: 109.1,
  M2: 25,
  S: 25,
  psi: 8.546,
  omega1: 7.618,
  omega2: 3,
  eta1: 0.5,
  eta2: 0.1212,
  lambda: 0.05893,
  sweep: 0.4545,
  pCorrect: 0.3703,
  scotoma: 0,
  mindless: 0,
};
