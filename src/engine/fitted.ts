/**
 * Parameters fitted to the Provo Corpus by tools/fit_cma.ts (CMA-ES, all free parameters at once,
 * 80 generations, 20 runs per passage) on passages 1–35, chosen on 36–45
 * (validation loss 13.60), and scored once on 46–55.
 */
import type { Params } from "./params.ts";

export const FITTED: Params = {
  alpha1: 87.73,
  alpha2: 7.796,
  alpha3: 73.8,
  delta: 0.1973,
  eps: 1.4,
  cv: 0.22,
  I: 25.0,
  pF: 0.07967,
  A: 50.0,
  pN: 0.0,
  regExtra: 30.0,
  V: 50.0,
  M1: 102.4,
  M2: 25.0,
  S: 25.0,
  psi: 8.628,
  omega1: 6.569,
  omega2: 3.0,
  eta1: 0.5,
  eta2: 0.329,
  lambda: 0.07528,
  sweep: 6.0,
  pCorrect: 0.3148,
  scotoma: 0.0,
  mindless: 0.0,
};
