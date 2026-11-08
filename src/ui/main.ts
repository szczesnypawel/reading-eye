/** The page: wires the engine to the canvases and controls. */
import { MEASURES, pearson } from "../engine/measures.ts";
import { Reader } from "../engine/model.ts";
import { KNOBS, type Params } from "../engine/params.ts";
import { READERS, type ReaderKind } from "../engine/readers.ts";
import { simulate } from "../engine/score.ts";
import { pageFromProvo, pageFromText, pxToPos, wordAt, type Lexicon, type Page, type ProvoDoc } from "../engine/text.ts";
import { drawPage, drawRetina, drawTimeline, drawWordChart, pageView, type Ghost } from "./draw.ts";
import { drawEyes } from "./eyes.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  lex: null as unknown as Lexicon,
  index: [] as { id: number; words: number; readers: number; preview: string }[],
  doc: null as ProvoDoc | null,
  page: null as unknown as Page,
  kind: READERS[0] as ReaderKind,
  params: { ...READERS[0].params } as Params,
  reader: null as unknown as Reader,
  seed: 1,
  playing: true,
  speed: 0.25,
  simTarget: 0,
  ghost: null as Ghost | null,
  flashes: new Map<number, number>(),
};

const dark = () => true;

async function loadJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function boot() {
  [state.lex, state.index] = await Promise.all([
    loadJSON<Lexicon>("/data/lexicon.json"),
    loadJSON<typeof state.index>("/data/provo/index.json"),
  ]);
  const pick = $<HTMLSelectElement>("text-pick");
  for (const t of state.index) {
    const o = document.createElement("option");
    o.value = String(t.id);
    o.textContent = `Provo ${String(t.id).padStart(2, "0")} · ${t.preview}`;
    pick.append(o);
  }
  const own = document.createElement("option");
  own.value = "own";
  own.textContent = "Your own text…";
  pick.append(own);
  pick.value = "3";
  pick.addEventListener("change", () => chooseText());

  buildReaders();
  buildKnobs();
  wire();
  await chooseText();
  requestAnimationFrame(frame);
}

async function chooseText() {
  const v = $<HTMLSelectElement>("text-pick").value;
  $("typed").hidden = v !== "own";
  $<HTMLInputElement>("ghost").disabled = v === "own";
  $<HTMLSelectElement>("ghost-pick").disabled = v === "own";
  if (v === "own") {
    state.doc = null;
    state.page = pageFromText($<HTMLTextAreaElement>("typed-text").value, state.lex);
  } else {
    state.doc = await loadJSON<ProvoDoc>(`/data/provo/text${v.padStart(2, "0")}.json`);
    state.page = pageFromProvo(state.doc, state.lex);
    const gp = $<HTMLSelectElement>("ghost-pick");
    gp.innerHTML = "";
    state.doc.readers.forEach((r, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `reader ${r.id}`;
      gp.append(o);
    });
  }
  restart();
  scheduleScore();
}

function restart() {
  state.seed = Math.floor(Math.random() * 1e9);
  state.reader = new Reader(state.page, state.params, state.seed);
  state.simTarget = 0;
  state.flashes.clear();
  setGhost();
}

function setGhost() {
  state.ghost = null;
  if (!state.doc || !$<HTMLInputElement>("ghost").checked) return;
  const r = state.doc.readers[Number($<HTMLSelectElement>("ghost-pick").value) || 0];
  if (!r) return;
  // start the real reader's clock at their first fixation on the text, like the model
  const first = r.fix.find(([x, y]) => {
    const p = pxToPos(state.page, x, y);
    return wordAt(state.page, p.line, p.col) === 0;
  }) ?? r.fix[0];
  state.ghost = { fix: r.fix, offset: first[2] };
}

function buildReaders() {
  const box = $("readers");
  for (const k of READERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(k === state.kind));
    b.innerHTML = `${k.name}${k.fitted ? '<span class="fit">FITTED</span>' : ""}`;
    b.addEventListener("click", () => {
      state.kind = k;
      Object.assign(state.params, k.params);
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      syncKnobs();
      restart();
      scheduleScore();
    });
    box.append(b);
  }
}

function buildKnobs() {
  const box = $("knobs");
  for (const k of KNOBS) {
    const row = document.createElement("div");
    row.className = "knob";
    const id = `knob-${k.key}`;
    row.innerHTML = `<label for="${id}">${k.name}</label><output id="${id}-v"></output>
      <input id="${id}" type="range" min="${k.min}" max="${k.max}" step="${k.step}">`;
    const input = row.querySelector("input")!;
    input.addEventListener("input", () => {
      state.params[k.key] = Number(input.value);
      // the reader holds this same params object, so the change acts on the running eye now
      syncKnobs();
      scheduleScore();
    });
    box.append(row);
  }
  syncKnobs();
}

function syncKnobs() {
  for (const k of KNOBS) {
    const v = state.params[k.key];
    $<HTMLInputElement>(`knob-${k.key}`).value = String(v);
    $(`knob-${k.key}-v`).textContent = k.step < 0.1 ? v.toFixed(2) : v.toFixed(k.step < 1 ? 1 : 0);
  }
  $("reader-note").textContent = `${state.kind.note}${state.kind.fitted ? "" : " Illustrative setting, not fitted to data."}`;
}

function wire() {
  const play = $<HTMLButtonElement>("play");
  play.addEventListener("click", () => {
    state.playing = !state.playing;
    play.textContent = state.playing ? "❚❚" : "▶";
    play.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  });
  $("restart").addEventListener("click", restart);
  $<HTMLSelectElement>("speed").addEventListener("change", (e) => (state.speed = Number((e.target as HTMLSelectElement).value)));
  $("typed-go").addEventListener("click", () => chooseText());
  $("ghost").addEventListener("change", setGhost);
  $("ghost-pick").addEventListener("change", () => restart());
  $("reset-knobs").addEventListener("click", () => {
    Object.assign(state.params, state.kind.params);
    syncKnobs();
    scheduleScore();
  });
  $<HTMLCanvasElement>("page").addEventListener("click", (e) => {
    const c = e.currentTarget as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const v = pageView(state.page, c.clientWidth);
    const p = v.inv(e.clientX - r.left, e.clientY - r.top);
    const pos = pxToPos(state.page, p.x, p.y);
    const w = wordAt(state.page, pos.line, pos.col);
    if (w < 0 || state.reader.finished) return;
    state.reader.grab(w);
    // paused: still complete the jump so the click shows
    if (!state.playing) for (let i = 0; i < 300 && (state.reader.nonlabile || state.reader.labile?.kind === "user" || state.reader.saccade); i++) state.reader.step();
    state.simTarget = state.reader.t;
  });
  addEventListener("keydown", (e) => {
    if (e.code === "Space" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      play.click();
    }
  });
}

// ---- live score against people ----------------------------------------------------------
let scoreTimer = 0;
function scheduleScore() {
  clearTimeout(scoreTimer);
  scoreTimer = window.setTimeout(runScore, 160);
}

function runScore() {
  const box = $("score");
  if (!state.doc) {
    box.innerHTML = `<p class="note">There are no eye-tracking data for typed text. Pick a Provo passage to compare the eye with real readers.</p>`;
    return;
  }
  const doc = state.doc;
  const model = simulate(doc, state.lex, state.params, 60, 7);
  const label: Record<string, string> = { skip: "words skipped", ffd: "first fixation", gd: "gaze duration", tt: "total time", refix: "refixations", regout: "looks back" };
  const rows = MEASURES.map((m) => {
    const pairs = doc.words
      .map((w, i) => [w.human[m], model[i][m]] as const)
      .filter((p, i): p is readonly [number, number] => i > 0 && p[0] !== null && p[1] !== null);
    const h = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const md = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    const fmt = (v: number) => (["skip", "refix", "regout"].includes(m) ? `${(v * 100).toFixed(0)}%` : `${v.toFixed(0)} ms`);
    return `<tr><td>${label[m]}</td><td>${fmt(h)}</td><td>${fmt(md)}</td><td>${Number.isFinite(r) ? r.toFixed(2) : "–"}</td></tr>`;
  }).join("");
  box.innerHTML = `<table><thead><tr><th></th><th>people</th><th>model</th><th>r per word</th></tr></thead><tbody>${rows}</tbody></table>
    <canvas id="word-chart" aria-label="Gaze duration per word, people against the model"></canvas>
    <p class="note">Gaze duration per word: <span style="color:var(--human)">84 people</span> and the <span style="color:var(--eye)">model</span> (60 runs, current settings). Updates as you move the controls.</p>`;
  drawWordChart($<HTMLCanvasElement>("word-chart"), doc.words.map((w) => w.human.gd), model.map((m) => m.gd), dark());
}

// ---- animation ------------------------------------------------------------------------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(100, now - last);
  last = now;
  const rd = state.reader;
  if (state.playing && !rd.finished) {
    state.simTarget += dt * state.speed;
    while (rd.t < state.simTarget && !rd.finished) {
      rd.step(1);
    }
  }
  // record failed integrations for the red flash
  for (const iv of rd.intervals) if (iv.flag === "fail" && iv.t1 !== null && !state.flashes.has(iv.word)) state.flashes.set(iv.word, iv.t1);
  drawPage($<HTMLCanvasElement>("page"), rd, state.ghost, state.flashes);
  const heroH = Math.max(220, Math.min(300, innerWidth * 0.2));
  drawEyes($<HTMLCanvasElement>("eyes"), rd, heroH);
  drawRetina($<HTMLCanvasElement>("strip"), rd, heroH);
  drawTimeline($<HTMLCanvasElement>("timeline"), rd, dark());
  stats();
  requestAnimationFrame(frame);
}

function stats() {
  const rd = state.reader;
  const fx = rd.fixations;
  const done = fx.filter((f) => f.end !== null);
  const mean = done.length ? done.reduce((s, f) => s + (f.end! - f.start), 0) / done.length : 0;
  const seen = new Set(fx.map((f) => f.word));
  const back = fx.filter((f, i) => i > 0 && f.word < fx[i - 1].word).length;
  const att = rd.page.words[rd.shift ? rd.shift.to : rd.att];
  const rows: [string, string][] = [
    ["time", `${(rd.t / 1000).toFixed(2)} s${rd.finished ? " · done" : ""}`],
    ["attending to", att ? `“${att.text}”` : "–"],
    ["fixations", String(fx.length)],
    ["mean fixation", `${mean.toFixed(0)} ms`],
    ["words never looked at", String(rd.page.words.length - seen.size)],
    ["looks back", String(back)],
    ["understood", `${(rd.understood * 100).toFixed(0)}%`],
  ];
  $("stats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

boot().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p style="padding:16px;color:#c8372f">Could not start: ${String(e)}</p>`);
});
