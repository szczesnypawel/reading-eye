/**
 * Parameters fitted to the Provo Corpus training passages (1–40) by tools/fit.ts
 * (300 hill-climb steps, 20 runs per passage, training loss 18.828).
 * Passages 41–55 are held out: score them with `node tools/score.ts fitted test`.
 */
import type { Params } from "./params.ts";

export const FITTED: Params = {
  alpha1: 100.5,
  alpha2: 2.922,
  alpha3: 42.08,
  delta: 0.1,
  eps: 1.113,
  cv: 0.22,
  I: 25,
  pF: 0.2763,
  A: 50,
  pN: 0.5,
  regExtra: 30,
  V: 50,
  M1: 117.2,
  M2: 25,
  S: 25,
  psi: 7.332,
  omega1: 8.224,
  omega2: 3,
  eta1: 0.5,
  eta2: 0.1202,
  lambda: 0.06624,
  sweep: 1.781,
  pCorrect: 0.6355,
  scotoma: 0,
  mindless: 0,
};
