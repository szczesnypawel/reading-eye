/**
 * The reading eye: an E-Z Reader 10-style model (Reichle et al. 2009) that runs in 1 ms steps,
 * so every inner process can be watched and grabbed while it runs.
 *
 * One word at a time gets attention. Its lexical processing has two stages: L1, a familiarity
 * check whose speed falls off with visual eccentricity, then L2, full access. L1 finishing
 * starts a saccade program to the next word. L2 finishing moves attention on and starts the
 * word's integration into the sentence. A saccade program is labile (cancellable) and then
 * non-labile. If the next word finishes L1 while the program to it is still labile, the program
 * is replaced and the eye skips that word. If integration fails, or a word is identified
 * before the one before it is integrated, the eye and attention go back.
 */
import type { Params } from "./params.ts";
import { Rng } from "./rng.ts";
import { lnFreqPerMillion, wordAt, type Page } from "./text.ts";

export type Stage = "waiting" | "L1" | "L2" | "done";

export interface WordState {
  stage: Stage;
  l1Need: number;
  l1Done: number;
  l2Need: number;
  l2Done: number;
  intNeed: number;
  intDone: number;
  integrating: boolean;
  integrated: boolean;
  regressions: number;
}

export interface Program {
  target: number;
  /** intended landing column on the target's line */
  col: number;
  kind: "next" | "refix" | "regress" | "timer" | "user";
  stage: "labile" | "nonlabile" | "ready";
  need: number;
  done: number;
}

export interface Fixation {
  line: number;
  col: number;
  word: number;
  start: number;
  end: number | null;
  /** this fixation's saccade was driven by a timer, not by the words (mind wandering) */
  wander: boolean;
}

export type Lane = "L1" | "L2" | "int" | "att" | "labile" | "nonlabile" | "sacc";
export interface Interval {
  lane: Lane;
  word: number;
  t0: number;
  t1: number | null;
  /** cancelled program, failed integration, regression saccade… */
  flag?: string;
}

export class Reader {
  t = 0;
  readonly words: WordState[];
  fixations: Fixation[] = [];
  att = 0;
  shift: { to: number; left: number } | null = null;
  labile: Program | null = null;
  nonlabile: Program | null = null;
  saccade: { from: { line: number; col: number }; to: { line: number; col: number }; left: number; dur: number; prog: Program } | null = null;
  intervals: Interval[] = [];
  finished = false;
  private rng: Rng;
  private open = new Map<string, Interval>();

  readonly page: Page;
  p: Params;

  constructor(page: Page, p: Params, seed = 1) {
    this.page = page;
    this.p = p;
    this.rng = new Rng(seed);
    this.words = page.words.map(() => ({
      stage: "waiting" as Stage,
      l1Need: 0,
      l1Done: 0,
      l2Need: 0,
      l2Done: 0,
      intNeed: 0,
      intDone: 0,
      integrating: false,
      integrated: false,
      regressions: 0,
    }));
    // the eye starts on the first word, a little left of its centre (like a fixation cross)
    const w0 = page.words[0];
    this.fixations.push({ line: w0.line, col: p.scotoma > 0 ? this.aim(0) : w0.col + Math.min(1, w0.len / 2), word: 0, start: 0, end: null, wander: false });
    this.beginWord(0);
  }

  // ---- geometry ---------------------------------------------------------------------
  get eye() {
    if (this.saccade) {
      const s = this.saccade;
      const f = 1 - s.left / s.dur;
      if (s.from.line === s.to.line) return { line: s.from.line, col: s.from.col + (s.to.col - s.from.col) * f, moving: true };
      return { line: f < 0.5 ? s.from.line : s.to.line, col: s.from.col + (s.to.col - s.from.col) * f, moving: true };
    }
    const f = this.fixations.at(-1)!;
    return { line: f.line, col: f.col, moving: false };
  }

  /** where the visual system "is": the fixation that began at least V ms ago */
  get visual(): Fixation {
    for (let i = this.fixations.length - 1; i >= 0; i--) {
      if (this.fixations[i].start <= this.t - this.p.V || i === 0) return this.fixations[i];
    }
    return this.fixations[0];
  }

  /** acuity at distance d (characters) from the point of fixation */
  acuity(d: number): number {
    const a = Math.pow(this.p.eps, -Math.abs(d));
    return this.p.scotoma > 0 && Math.abs(d) < this.p.scotoma ? a * 0.05 : a;
  }

  /** processing rate of a word's L1 from a fixation: geometric mean of its letters' acuity */
  rate(word: number, from: { line: number; col: number }): number {
    const w = this.page.words[word];
    if (w.line !== from.line) return 1e-3;
    let s = 0;
    for (let i = 0; i < w.len; i++) s += Math.log(this.acuity(w.col + i + 0.5 - from.col));
    return Math.max(Math.exp(s / w.len), 1e-3);
  }

  /**
   * where saccades aim on a word: its centre, or with a blind centre, just left of the word so the
   * word falls on working retina to the right (a "preferred retinal locus", learned by patients)
   */
  aim(word: number) {
    const w = this.page.words[word];
    return this.p.scotoma > 0 ? w.col - this.p.scotoma * 0.9 : this.center(word);
  }

  center(word: number) {
    const w = this.page.words[word];
    return w.col + w.len / 2;
  }

  // ---- interval bookkeeping for the timeline -------------------------------------------
  private openI(lane: Lane, word: number, flag?: string) {
    const iv: Interval = { lane, word, t0: this.t, t1: null, flag };
    this.intervals.push(iv);
    this.open.set(lane + (lane === "int" ? word : ""), iv);
  }
  private closeI(lane: Lane, word?: number, flag?: string) {
    const key = lane + (lane === "int" ? word : "");
    const iv = this.open.get(key);
    if (!iv) return;
    iv.t1 = this.t;
    if (flag) iv.flag = flag;
    this.open.delete(key);
  }

  // ---- lexical processing -------------------------------------------------------------
  /** mean L1 time (Equation 1, lower branch) with the predictability that is usable now */
  private baseTime(word: number, pred: number) {
    const w = this.page.words[word];
    const mu = this.p.alpha1 - this.p.alpha2 * lnFreqPerMillion(w.zipf) - this.p.alpha3 * pred;
    return Math.max(mu, 10);
  }

  private beginWord(k: number) {
    const ws = this.words[k];
    if (ws.stage === "done") return;
    if (ws.stage === "waiting") {
      // predictability helps only if the previous word is already integrated (E-Z Reader 10)
      const pred = k === 0 || this.words[k - 1].integrated ? this.page.words[k].pred : 0;
      const mu = this.baseTime(k, pred);
      // with probability = predictability the word is guessed: L1 takes no time (Equation 1)
      ws.l1Need = this.rng.next() < pred ? 0 : this.rng.gamma(mu, this.p.cv);
      ws.l2Need = this.rng.gamma(this.p.delta * mu, this.p.cv);
      ws.l1Done = 0;
      ws.l2Done = 0;
      ws.stage = "L1";
    }
    this.openI(ws.stage === "L1" ? "L1" : "L2", k);
  }

  private onL1(k: number) {
    this.closeI("L1");
    this.openI("L2", k);
    if (this.wandering) return;
    if (k + 1 < this.words.length) this.program(k + 1, "next");
  }

  private onL2(k: number) {
    this.closeI("L2");
    const ws = this.words[k];
    ws.integrating = true;
    ws.intNeed = this.rng.gamma(this.p.I, this.p.cv);
    ws.intDone = 0;
    this.openI("int", k);
    // E-Z Reader 10: identifying word k before k-1 is integrated is an integration failure
    if (k > 0 && this.words[k - 1].integrating) this.fail(k - 1);
    if (this.att !== k) return; // a failure moved attention back
    const next = this.words.findIndex((w, i) => i > k && w.stage !== "done");
    if (next === -1) return;
    this.shiftTo(next);
  }

  private shiftTo(k: number) {
    const cur = this.words[this.att];
    if (cur && cur.stage !== "done") {
      this.closeI("L1");
      this.closeI("L2");
    }
    this.closeI("att");
    this.shift = { to: k, left: this.rng.gamma(this.p.A, this.p.cv) };
    this.openI("att", k);
  }

  /**
   * Integration of word k failed. With probability pN the eyes and attention go back to word k,
   * otherwise to word k-1; from there the words are processed again (L1, L2 and I).
   */
  private fail(k: number) {
    const ws = this.words[k];
    ws.integrating = false;
    this.closeI("int", k, "fail");
    const back = k > 0 && this.rng.next() >= this.p.pN ? k - 1 : k;
    for (let i = back; i < this.words.length; i++) {
      const w = this.words[i];
      if (i <= k || w.stage === "L1" || w.stage === "L2") {
        w.stage = "waiting";
        w.integrating = false;
        if (i <= k) w.integrated = false;
      }
    }
    // second passes rarely fail again (the paper makes this probability "very small")
    this.words[back].regressions++;
    ws.regressions++;
    this.closeI("L1");
    this.closeI("L2");
    this.att = back;
    this.closeI("att");
    this.shift = { to: back, left: this.rng.gamma(this.p.A, this.p.cv) };
    this.openI("att", back, "back");
    if (this.fixations.at(-1)!.word !== back) this.program(back, "regress");
  }

  // ---- saccade programming ------------------------------------------------------------
  private get wandering() {
    return this.fixations.at(-1)!.wander;
  }

  program(target: number, kind: Program["kind"], col?: number) {
    if (this.labile) this.closeI("labile", undefined, "cancelled");
    this.labile = {
      target,
      col: col ?? this.aim(target),
      kind,
      stage: "labile",
      need: this.rng.gamma(this.p.M1 + (kind === "timer" ? 120 : 0) + (kind === "regress" ? this.p.regExtra : 0), this.p.cv),
      done: 0,
    };
    this.openI("labile", target, kind);
  }

  private launch(prog: Program) {
    const from = this.fixations.at(-1)!;
    from.end = this.t;
    const tw = this.page.words[prog.target];
    let col: number;
    if (tw.line === from.line) {
      const D = prog.col - from.col;
      let sys = 0;
      if (D > 0 && prog.kind !== "regress") {
        const dur = Math.max(this.t - from.start, 1);
        sys = ((this.p.psi - D) * (this.p.omega1 - Math.log(dur))) / this.p.omega2;
      }
      col = prog.col + sys + this.rng.normal(0, this.p.eta1 + this.p.eta2 * Math.abs(D));
    } else {
      // return sweep to a new line: lands near the line start (not part of E-Z Reader)
      col = tw.col + Math.max(0, this.rng.normal(this.p.sweep, 1.2));
    }
    const lastOnLine = this.page.words.filter((w) => w.line === tw.line).at(-1)!;
    col = Math.min(Math.max(col, -1), lastOnLine.col + lastOnLine.len + 1);
    this.saccade = { from: { line: from.line, col: from.col }, to: { line: tw.line, col }, left: this.p.S, dur: this.p.S, prog };
    this.openI("sacc", prog.target, prog.kind);
  }

  private land() {
    const s = this.saccade!;
    this.saccade = null;
    this.closeI("sacc");
    const word = wordAt(this.page, s.to.line, s.to.col);
    const wander = this.rng.next() < this.p.mindless;
    this.fixations.push({ line: s.to.line, col: s.to.col, word, start: this.t, end: null, wander });
    if (wander) {
      if (word + 1 < this.words.length) this.program(word + 1, "timer");
      return;
    }
    // corrective look-back: the eye passed a word attention has not yet recognised
    const aw = this.words[this.att];
    if (this.att < word && aw.stage === "L1" && !this.shift && this.rng.next() < this.p.pCorrect) {
      this.program(this.att, "regress");
      return;
    }
    // automatic refixation, more likely the further from the word's centre the eye landed
    const ws = this.words[word];
    const off = s.to.col - this.center(word);
    if ((ws.stage === "waiting" || ws.stage === "L1") && this.rng.next() < this.p.lambda * Math.abs(off)) {
      const w = this.page.words[word];
      this.program(word, "refix", this.center(word) - Math.sign(off) * w.len * 0.2);
    }
  }

  /** the viewer grabs the eye: send it to a word now */
  grab(word: number) {
    if (this.finished) return;
    // attention goes with the eye: drop the half-read word and start reading from here
    const cur = this.words[this.att];
    if (cur.stage === "L1" || cur.stage === "L2") cur.stage = "waiting";
    this.closeI("L1");
    this.closeI("L2");
    this.closeI("att");
    this.shift = null;
    const ws = this.words[word];
    if (ws.stage === "done" && !ws.integrating) ws.stage = "waiting";
    this.att = word;
    this.openI("att", word, "user");
    this.closeI("att");
    this.beginWord(word);
    this.program(word, "user");
    this.labile!.need = 0;
  }

  // ---- one millisecond -----------------------------------------------------------------
  step(dt = 1) {
    if (this.finished) return;
    this.t += dt;

    // attention and lexical processing
    if (this.shift) {
      this.shift.left -= dt;
      if (this.shift.left <= 0) {
        this.closeI("att");
        this.att = this.shift.to;
        this.shift = null;
        this.beginWord(this.att);
      }
    } else {
      const k = this.att;
      const ws = this.words[k];
      const slow = 1 - 0.7 * this.p.mindless * (this.wandering ? 1 : 0);
      if (ws.stage === "L1") {
        ws.l1Done += dt * this.rate(k, this.visual) * slow;
        if (ws.l1Done >= ws.l1Need) {
          ws.stage = "L2";
          this.onL1(k);
        }
      } else if (ws.stage === "L2") {
        ws.l2Done += dt * slow;
        if (ws.l2Done >= ws.l2Need) {
          ws.stage = "done";
          this.onL2(k);
        }
      }
    }

    // integration of identified words
    for (let k = 0; k < this.words.length; k++) {
      const ws = this.words[k];
      if (!ws.integrating) continue;
      ws.intDone += dt;
      if (ws.intDone >= ws.intNeed) {
        if (ws.regressions === 0 && this.rng.next() < this.p.pF) {
          this.fail(k);
        } else {
          ws.integrating = false;
          ws.integrated = true;
          this.closeI("int", k);
        }
      }
    }

    // the eye follows attention: if no saccade is planned and the eye is not on the attended
    // word, plan one to it. Without this the eye can sit still while attention works on a far
    // word at a tiny rate (after a refixation plan replaced the forward one, or when attention
    // is on another line, which E-Z Reader, a one-line model, never meets) and wait for seconds.
    if (!this.labile && !this.nonlabile && !this.saccade && !this.shift && !this.wandering) {
      const cur = this.fixations.at(-1)!;
      if (cur.word !== this.att && this.words[this.att].stage === "L1") {
        this.program(this.att, this.att < cur.word ? "regress" : "next");
      }
    }

    // saccade programs
    if (this.labile && this.labile.stage === "labile") {
      this.labile.done += dt;
      if (this.labile.done >= this.labile.need && !this.nonlabile) {
        this.closeI("labile");
        this.nonlabile = { ...this.labile, stage: "nonlabile", need: this.rng.gamma(this.p.M2, this.p.cv), done: 0 };
        this.labile = null;
        this.openI("nonlabile", this.nonlabile.target, this.nonlabile.kind);
      }
    }
    if (this.nonlabile) {
      if (this.nonlabile.stage === "nonlabile") {
        this.nonlabile.done += dt;
        if (this.nonlabile.done >= this.nonlabile.need) this.nonlabile.stage = "ready";
      }
      if (this.nonlabile.stage === "ready" && !this.saccade) {
        this.closeI("nonlabile");
        const prog = this.nonlabile;
        this.nonlabile = null;
        this.launch(prog);
      }
    }
    if (this.saccade) {
      this.saccade.left -= dt;
      if (this.saccade.left <= 0) this.land();
    }

    // the end: last word integrated, or a mind-wandering eye ran off the end
    const last = this.words.length - 1;
    const cur = this.fixations.at(-1)!;
    const runOff = cur.wander && cur.word === last && !this.labile && !this.nonlabile && !this.saccade && this.t - cur.start > 250;
    if ((this.words[last].integrated && !this.saccade) || runOff || this.t > 120000) {
      this.fixations.at(-1)!.end = this.t;
      this.finished = true;
    }
  }

  run(maxMs = 120000) {
    while (!this.finished && this.t < maxMs) this.step(1);
    return this.fixations;
  }

  /** share of words fully understood (integrated) */
  get understood() {
    return this.words.filter((w) => w.integrated).length / this.words.length;
  }
}
