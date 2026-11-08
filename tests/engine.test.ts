import assert from "node:assert/strict";
import { test } from "node:test";
import { meanMeasures, wordMeasures } from "../src/engine/measures.ts";
import { Reader } from "../src/engine/model.ts";
import { EZR10, type Params } from "../src/engine/params.ts";
import { pageFromText, type Lexicon } from "../src/engine/text.ts";
import { loadLexicon } from "../tools/load.ts";

const lex: Lexicon = loadLexicon();
const TEXT =
  "The quick brown fox jumps over the lazy dog while the farmer sleeps in the barn. " +
  "Nobody expected the ornithologist to catalogue every sesquipedalian idiosyncrasy of the archipelago.";
const page = pageFromText(TEXT, lex);
const P: Params = { ...EZR10, pCorrect: 0.5 };

function many(p: Params, n = 60) {
  const runs = [];
  let understood = 0;
  let time = 0;
  for (let s = 0; s < n; s++) {
    const r = new Reader(page, p, s + 1);
    const fx = r.run();
    understood += r.understood;
    time += r.t;
    runs.push(wordMeasures(fx.map((f) => ({ word: f.word, dur: (f.end ?? r.t) - f.start })), page.words.length));
  }
  return { m: meanMeasures(runs, page.words.length), understood: understood / n, time: time / n };
}

test("measures follow the interest-area definitions", () => {
  // words: 0 1 2 3; fixations 0,0 → 2 → 1 → 3
  const m = wordMeasures(
    [
      { word: 0, dur: 200 },
      { word: 0, dur: 100 },
      { word: 2, dur: 250 },
      { word: 1, dur: 180 },
      { word: 3, dur: 220 },
    ],
    4,
  );
  assert.deepEqual(m[0], { skip: 0, ffd: 200, gd: 300, tt: 300, refix: 1, regout: 0 });
  assert.equal(m[1].skip, 1); // fixated only after word 2: skipped in first pass
  assert.equal(m[1].tt, 180);
  assert.equal(m[2].regout, 1);
  assert.equal(m[3].gd, 220);
});

test("the same seed gives the same reading", () => {
  const a = new Reader(page, P, 42).run().map((f) => [f.word, f.start]);
  const b = new Reader(page, P, 42).run().map((f) => [f.word, f.start]);
  assert.deepEqual(a, b);
});

test("every word is understood and reading ends", () => {
  const r = new Reader(page, P, 3);
  r.run();
  assert.ok(r.finished);
  assert.equal(r.understood, 1);
});

test("common short words are skipped more, rare long words looked at longer", () => {
  const { m } = many(P);
  const idx = (w: string) => page.words.findIndex((x) => x.text.replace(/\W/g, "") === w);
  const the = idx("the");
  const rare = idx("sesquipedalian");
  assert.ok(m[the].skip! > m[rare].skip!, `skip the ${m[the].skip} vs rare ${m[rare].skip}`);
  assert.ok((m[rare].gd ?? 0) > (m[idx("dog")].gd ?? 0) + 50, `gd rare ${m[rare].gd}`);
});

test("a blind centre slows reading; mind wandering loses words", () => {
  const base = many(P, 30);
  const scot = many({ ...P, scotoma: 2.5 }, 30);
  const wander = many({ ...P, mindless: 0.9 }, 30);
  assert.ok(scot.time > base.time * 1.2, `scotoma ${scot.time} vs ${base.time}`);
  assert.ok(wander.understood < 0.8, `understood while wandering ${wander.understood}`);
});

test("a click sends the eye to a word, and reading goes on from there", () => {
  const r = new Reader(page, P, 5);
  for (let i = 0; i < 300; i++) r.step();
  const target = page.words.findIndex((w) => w.text === "ornithologist");
  r.grab(target);
  for (let i = 0; i < 400; i++) r.step();
  const words = r.fixations.slice(-3).map((f) => f.word);
  assert.ok(words.some((w) => w >= target - 1 && w <= target + 2), `fixations after click: ${words}`);
  assert.ok(r.att >= target, `attention at ${r.att}, clicked ${target}`);
});
