/**
 * Parameters of the reading eye. The structure follows E-Z Reader 10 (Reichle, Warren &
 * McConnell, 2009, Psychonomic Bulletin & Review 16(1), 1–21; PMC2629133). `EZR10` holds that
 * paper's values, checked against the text; `fitted.ts` holds values fitted to the Provo Corpus.
 * Times in ms, distances in character spaces.
 */
export interface Params {
  /** L1 (familiarity check) mean time: alpha1 − alpha2·ln(freq per million) − alpha3·pred */
  alpha1: number;
  alpha2: number;
  alpha3: number;
  /** L2 (lexical access) = delta × the L1 base time */
  delta: number;
  /** Visual acuity: processing slows by eps per character of mean letter eccentricity */
  eps: number;
  /** Coefficient of variation of every gamma-distributed stage */
  cv: number;
  /** Post-lexical integration time and probability it fails (→ regression) */
  I: number;
  pF: number;
  /** Attention shift time (mean of a gamma) */
  A: number;
  /** After an integration failure: probability the eyes go back to that word, else the one before */
  pN: number;
  /** Extra labile programming time for regressive saccades */
  regExtra: number;
  /** Eye-mind lag: visual input from a new fixation arrives V ms after it starts */
  V: number;
  /** Saccade programming: labile (cancellable) and non-labile stage; saccade duration */
  M1: number;
  M2: number;
  S: number;
  /** Systematic saccade error: optimal length psi, launch-duration terms omega1, omega2 */
  psi: number;
  omega1: number;
  omega2: number;
  /** Random saccade error sd = eta1 + eta2·|intended length| */
  eta1: number;
  eta2: number;
  /** Refixation probability per character of distance from the word centre */
  lambda: number;
  /** Return sweep to a new line: mean landing column from the line start */
  sweep: number;
  /**
   * Corrective look-back (not in E-Z Reader): if the eye lands past the word attention is still
   * trying to recognise, it goes back to it with this probability
   */
  pCorrect: number;
  /** Central scotoma radius in characters (0 = healthy fovea); letters inside are near-blind */
  scotoma: number;
  /** Mindless reading: 0 = eyes wait for words, 1 = eyes move on a timer, ignoring the words */
  mindless: number;
}

export const EZR10: Params = {
  // Reichle, Warren & McConnell (2009): alpha1–3, delta, M1 and lambda as changed for E-Z Reader 10
  alpha1: 98,
  alpha2: 2,
  alpha3: 27,
  delta: 0.25,
  eps: 1.15,
  cv: 0.22,
  I: 25,
  // pF and pN are not given as single values in the 2009 paper; these are the defaults in
  // Reichle, Rayner & Pollatsek (2012, Visual Cognition, Table 1)
  pF: 0.05,
  A: 50,
  pN: 0.5,
  regExtra: 30,
  V: 50,
  M1: 125,
  M2: 25,
  S: 25,
  psi: 7,
  omega1: 7.3,
  omega2: 3,
  eta1: 0.5,
  eta2: 0.15,
  lambda: 0.05,
  // not part of E-Z Reader (see model.ts)
  sweep: 1.5,
  pCorrect: 0,
  scotoma: 0,
  mindless: 0,
};

/** Which parameters a viewer can grab, with a plain-words name and a range. */
export const KNOBS: { key: keyof Params; name: string; min: number; max: number; step: number }[] = [
  { key: "alpha1", name: "word recognition (ms)", min: 40, max: 300, step: 1 },
  { key: "alpha2", name: "frequency effect", min: 0, max: 12, step: 0.1 },
  { key: "alpha3", name: "prediction effect", min: 0, max: 120, step: 1 },
  { key: "eps", name: "acuity falloff", min: 1.0, max: 1.6, step: 0.01 },
  { key: "M1", name: "saccade planning (ms)", min: 60, max: 250, step: 1 },
  { key: "pF", name: "integration failure", min: 0, max: 0.3, step: 0.005 },
  { key: "lambda", name: "refixation drive", min: 0, max: 0.5, step: 0.01 },
  { key: "scotoma", name: "blind centre (chars)", min: 0, max: 4, step: 0.1 },
  { key: "mindless", name: "mind wandering", min: 0, max: 1, step: 0.01 },
];
