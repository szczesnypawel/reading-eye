/** Canvas drawing: the page with the eye, the retina strip, and the timeline of inner processes. */
import type { Interval, Reader } from "../engine/model.ts";
import { posToPx, type Page } from "../engine/text.ts";

export const C = {
  ink: "#dde3df",
  muted: "#7b868f",
  faint: "#3a444c",
  l1: "#e0a526",
  l2: "#22b8b0",
  int: "#9a7cf0",
  fail: "#ff5a4f",
  att: "rgba(242, 215, 107, 0.22)",
  eye: "#6f8cff",
  human: "#ff5fb0",
};

export interface Ghost {
  fix: [number, number, number, number][];
  /** human time = model time + offset */
  offset: number;
}

/** size a canvas to its CSS width at device resolution; returns css width and the context */
export function fit(canvas: HTMLCanvasElement, cssHeight: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, ctx };
}

export function pageExtent(page: Page) {
  let right = 0;
  page.words.forEach((w) => (right = Math.max(right, page.lineLeft[w.line] + (w.col + w.len + 1) * page.ppc)));
  const left = Math.min(...page.lineLeft);
  const top = page.lineY[0] - page.lineHeight / 2;
  const bottom = page.lineY.at(-1)! + page.lineHeight / 2;
  return { x0: left - 40, x1: right + 40, y0: top - 10, y1: bottom + 10 };
}

/** page-pixel → canvas transform for the page panel */
export function pageView(page: Page, cssW: number) {
  const ext = pageExtent(page);
  const s = cssW / (ext.x1 - ext.x0);
  return {
    s,
    h: (ext.y1 - ext.y0) * s,
    X: (x: number) => (x - ext.x0) * s,
    Y: (y: number) => (y - ext.y0) * s,
    inv: (cx: number, cy: number) => ({ x: cx / s + ext.x0, y: cy / s + ext.y0 }),
  };
}

function ghostAt(g: Ghost, t: number) {
  const ht = t + g.offset;
  let last = -1;
  for (let i = 0; i < g.fix.length; i++) {
    if (g.fix[i][2] <= ht) last = i;
    else break;
  }
  if (last === -1) return null;
  const [x, y, s, d] = g.fix[last];
  if (ht <= s + d || last === g.fix.length - 1) return { x, y, i: last, done: ht > s + d && last === g.fix.length - 1 };
  const nx = g.fix[last + 1];
  const f = Math.min(1, (ht - s - d) / Math.max(1, nx[2] - s - d));
  return { x: x + (nx[0] - x) * f, y: y + (nx[1] - y) * f, i: last, done: false };
}

export function drawPage(canvas: HTMLCanvasElement, rd: Reader, ghost: Ghost | null, flashes: Map<number, number>) {
  const page = rd.page;
  const cssW = canvas.clientWidth;
  const v = pageView(page, cssW);
  const { ctx } = fit(canvas, v.h);
  ctx.clearRect(0, 0, cssW, v.h);
  const cw = page.ppc * v.s;
  ctx.font = `${Math.round(cw / 0.6)}px "Courier Prime", "Courier New", monospace`;
  const adv = ctx.measureText("M").width;
  const fs = Math.round(cw / 0.6) * (cw / adv);
  ctx.font = `${fs}px "Courier Prime", "Courier New", monospace`;
  ctx.textBaseline = "middle";

  // attention spotlight
  const att = rd.shift ? rd.shift.to : rd.att;
  const aw = page.words[att];
  const ap = posToPx(page, aw.line, aw.col);
  ctx.fillStyle = C.att;
  const hh = fs * 1.25;
  roundRect(ctx, v.X(ap.x) - 3, v.Y(ap.y) - hh / 2, aw.len * cw + 6, hh, 4);
  ctx.globalAlpha = rd.shift ? 0.45 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;

  // words with their lexical progress underneath
  page.words.forEach((w, i) => {
    const ws = rd.words[i];
    const p = posToPx(page, w.line, w.col);
    const x = v.X(p.x);
    const y = v.Y(p.y);
    const flash = flashes.get(i);
    const failed = flash !== undefined && rd.t - flash < 600;
    ctx.fillStyle = failed ? C.fail : ws.stage === "waiting" && !ws.integrated ? "#56606a" : C.ink;
    ctx.fillText(w.text, x, y);
    const bw = w.len * cw;
    const by = y + fs * 0.62;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, by, bw, 3);
    const f1 = ws.stage === "waiting" ? 0 : Math.min(1, ws.l1Done / Math.max(ws.l1Need, 1e-6));
    const f2 = ws.stage === "L2" || ws.stage === "done" ? Math.min(1, ws.l2Done / Math.max(ws.l2Need, 1e-6)) : 0;
    ctx.fillStyle = C.l1;
    ctx.fillRect(x, by, bw * 0.6 * f1, 3);
    ctx.fillStyle = C.l2;
    ctx.fillRect(x + bw * 0.6, by, bw * 0.4 * (ws.stage === "done" ? 1 : f2), 3);
    if (ws.integrating || ws.integrated) {
      ctx.fillStyle = ws.integrated ? C.int : "rgba(154,124,240,0.45)";
      ctx.beginPath();
      ctx.arc(x + bw + cw * 0.45, by + 1.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // the human reader (ghost)
  if (ghost) {
    const g = ghostAt(ghost, rd.t);
    if (g) {
      ctx.strokeStyle = "rgba(255,95,176,0.4)";
      ctx.fillStyle = "rgba(255,95,176,0.18)";
      ctx.lineWidth = 1;
      const from = Math.max(0, g.i - 8);
      ctx.beginPath();
      for (let i = from; i <= g.i; i++) {
        const [x, y] = ghost.fix[i];
        if (i === from) ctx.moveTo(v.X(x), v.Y(y) + fs * 0.9);
        else ctx.lineTo(v.X(x), v.Y(y) + fs * 0.9);
      }
      ctx.stroke();
      ctx.fillStyle = C.human;
      ctx.beginPath();
      ctx.arc(v.X(g.x), v.Y(g.y) + fs * 0.9, Math.max(3, cw * 0.32), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // scanpath trail of the model's eye
  const fx = rd.fixations;
  const from = Math.max(0, fx.length - 14);
  ctx.lineWidth = 1.2;
  for (let i = from; i < fx.length; i++) {
    const f = fx[i];
    const p = posToPx(page, f.line, f.col);
    const dur = (f.end ?? rd.t) - f.start;
    const a = 0.15 + (0.6 * (i - from)) / (fx.length - from);
    if (i > from) {
      const q = posToPx(page, fx[i - 1].line, fx[i - 1].col);
      ctx.strokeStyle = `rgba(111,140,255,${a * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(v.X(q.x), v.Y(q.y) - fs * 0.9);
      ctx.lineTo(v.X(p.x), v.Y(p.y) - fs * 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = f.wander ? `rgba(140,140,140,${a})` : `rgba(111,140,255,${a})`;
    ctx.beginPath();
    ctx.arc(v.X(p.x), v.Y(p.y) - fs * 0.9, 2 + Math.sqrt(dur) * 0.35 * v.s * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // saccade programs: dashed while still cancellable, solid once committed
  const eye = rd.eye;
  const ep = posToPx(page, eye.line, eye.col);
  for (const prog of [rd.labile, rd.nonlabile]) {
    if (!prog) continue;
    const tw = page.words[prog.target];
    const tp = posToPx(page, tw.line, prog.col);
    const x0 = v.X(ep.x), y0 = v.Y(ep.y) - fs * 0.9;
    const x1 = v.X(tp.x), y1 = v.Y(tp.y) - fs * 0.9;
    const lift = Math.min(40, 10 + Math.abs(x1 - x0) * 0.25);
    ctx.strokeStyle = prog.kind === "regress" ? C.fail : C.eye;
    ctx.setLineDash(prog.stage === "labile" ? [4, 4] : []);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - lift, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    const frac = Math.min(1, prog.done / Math.max(prog.need, 1e-6));
    ctx.beginPath();
    ctx.arc(x1, y1, 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // the eye: fovea and the edge of useful vision
  const ex = v.X(ep.x);
  const ey = v.Y(ep.y);
  ctx.strokeStyle = "rgba(111,140,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(ex, ey, cw * 7, fs * 1.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (rd.p.scotoma > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.ellipse(ex, ey, cw * rd.p.scotoma, fs * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = eye.moving ? "rgba(111,140,255,0.35)" : "rgba(111,140,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(ex, ey, cw * 1.5, fs * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.eye;
  ctx.beginPath();
  ctx.arc(ex, ey - fs * 0.9, eye.moving ? 3 : 4.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The current line as the retina gets it: sharp at the centre, blurred and faded outside, using
 * the model's own acuity. Above: the attended word and the planned jump. Below: the acuity curve.
 * During a saccade the image smears, as it does on a real retina.
 */
export function drawRetina(canvas: HTMLCanvasElement, rd: Reader, cssH: number) {
  const { w, ctx } = fit(canvas, cssH);
  const H = cssH;
  ctx.fillStyle = "#0b0e11";
  ctx.fillRect(0, 0, w, H);
  const page = rd.page;
  const eye = rd.eye;
  const span = 20;
  const cw = w / (span * 2);
  const fs = cw / 0.6;
  const cx = w / 2;
  const textY = H * 0.36;
  const plotTop = H * 0.62;
  const plotBot = H - 22;

  // glow of the fovea
  const glow = ctx.createRadialGradient(cx, textY, 0, cx, textY, cw * 7);
  glow.addColorStop(0, "rgba(120,150,255,0.16)");
  glow.addColorStop(1, "rgba(120,150,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, plotTop);

  const X = (col: number) => cx + (col - eye.col) * cw;

  // attended word: a warm bar under it, filling as it is recognised
  const ai = rd.shift ? rd.shift.to : rd.att;
  const aw = page.words[ai];
  if (aw && aw.line === eye.line) {
    const ws = rd.words[ai];
    const x0 = X(aw.col);
    const bw = aw.len * cw;
    ctx.fillStyle = "rgba(242,215,107,0.12)";
    ctx.fillRect(x0 - 3, textY - fs * 0.75, bw + 6, fs * 1.5);
    const f1 = ws.stage === "waiting" ? 0 : Math.min(1, ws.l1Done / Math.max(ws.l1Need, 1e-6));
    const f2 = ws.stage === "L2" || ws.stage === "done" ? Math.min(1, ws.l2Done / Math.max(ws.l2Need, 1e-6)) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x0, textY + fs * 0.62, bw, 4);
    ctx.fillStyle = C.l1;
    ctx.fillRect(x0, textY + fs * 0.62, bw * 0.6 * f1, 4);
    ctx.fillStyle = C.l2;
    ctx.fillRect(x0 + bw * 0.6, textY + fs * 0.62, bw * 0.4 * (ws.stage === "done" ? 1 : f2), 4);
  }

  // the planned jump
  for (const prog of [rd.labile, rd.nonlabile]) {
    if (!prog) continue;
    const tw = page.words[prog.target];
    if (tw.line !== eye.line) continue;
    const tx = X(prog.col);
    const y = textY - fs * 1.05;
    ctx.strokeStyle = prog.kind === "regress" ? C.fail : "#8fa3e6";
    ctx.lineWidth = 2;
    ctx.setLineDash(prog.stage === "labile" ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo((cx + tx) / 2, y - Math.min(60, 14 + Math.abs(tx - cx) * 0.2), tx, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(tx, y + 2);
    ctx.lineTo(tx - 6, y - 8);
    ctx.lineTo(tx + 6, y - 8);
    ctx.closePath();
    ctx.fill();
  }

  // letters
  ctx.font = `${fs}px "Courier Prime", "Courier New", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const sac = rd.saccade;
  const dir = sac ? Math.sign(sac.to.col - sac.from.col) || 1 : 0;
  for (const word of page.words) {
    if (word.line !== eye.line) continue;
    for (let i = 0; i < word.len; i++) {
      const col = word.col + i + 0.5;
      const d = col - eye.col;
      if (Math.abs(d) > span + 1) continue;
      const a = rd.acuity(d);
      const x = cx + d * cw;
      if (sac) {
        // smear along the direction of travel
        ctx.filter = "blur(1.5px)";
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = `rgba(241,239,232,${0.07 + 0.1 * a})`;
          ctx.fillText(word.text[i], x - dir * k * cw * 0.55, textY);
        }
        continue;
      }
      const blur = Math.min(9, (1 - a) * 8);
      ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
      ctx.fillStyle = `rgba(241,239,232,${0.2 + 0.8 * a})`;
      ctx.fillText(word.text[i], x, textY);
    }
  }
  ctx.filter = "none";
  if (rd.p.scotoma > 0) {
    const g = ctx.createRadialGradient(cx, textY, 0, cx, textY, rd.p.scotoma * cw * 1.3);
    g.addColorStop(0, "rgba(5,6,8,0.97)");
    g.addColorStop(0.75, "rgba(5,6,8,0.9)");
    g.addColorStop(1, "rgba(5,6,8,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, plotTop);
  }

  // centre of gaze
  ctx.strokeStyle = "rgba(143,163,230,0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, textY - fs * 1.6);
  ctx.lineTo(cx, textY - fs * 1.2);
  ctx.moveTo(cx, textY + fs * 1.0);
  ctx.lineTo(cx, plotBot);
  ctx.stroke();

  // acuity curve
  ctx.textAlign = "start";
  ctx.font = `11px "IBM Plex Mono", monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, plotTop, w, plotBot - plotTop);
  const Y = (a: number) => plotBot - a * (plotBot - plotTop - 6);
  const grad = ctx.createLinearGradient(0, plotTop, 0, plotBot);
  grad.addColorStop(0, "rgba(120,150,255,0.55)");
  grad.addColorStop(1, "rgba(120,150,255,0.05)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, plotBot);
  for (let px = 0; px <= w; px += 2) ctx.lineTo(px, Y(rd.acuity((px - cx) / cw)));
  ctx.lineTo(w, plotBot);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8fa3e6";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let px = 0; px <= w; px += 2) {
    const y = Y(rd.acuity((px - cx) / cw));
    if (px === 0) ctx.moveTo(px, y);
    else ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.fillStyle = "#7f878e";
  for (const d of [-20, -10, 0, 10, 20]) {
    const x = cx + d * cw;
    ctx.fillRect(x, plotBot, 1, 4);
    ctx.fillText(d === 0 ? "0" : `${d > 0 ? "+" : ""}${d}`, x - (d === 0 ? 3 : 10), plotBot + 15);
  }
  ctx.fillText("acuity", 8, plotTop + 14);
  ctx.textAlign = "end";
  ctx.fillText("characters from the centre of gaze", w - 8, plotTop + 14);
  ctx.textAlign = "start";
  if (sac) {
    ctx.fillStyle = "#c7cdd2";
    ctx.font = `12px "IBM Plex Mono", monospace`;
    ctx.fillText("saccade · the image smears and is suppressed", 10, 18);
  }
}

const LANES: { key: string; name: string; color: string }[] = [
  { key: "eye", name: "eye on", color: C.eye },
  { key: "att", name: "attention", color: "#d9b93a" },
  { key: "L1", name: "L1 familiar?", color: C.l1 },
  { key: "L2", name: "L2 access", color: C.l2 },
  { key: "int", name: "integration", color: C.int },
  { key: "labile", name: "plan (labile)", color: "#8fa3e6" },
  { key: "nonlabile", name: "plan (committed)", color: C.eye },
];

export function drawTimeline(canvas: HTMLCanvasElement, rd: Reader, dark: boolean) {
  const laneH = 20;
  const top = 6;
  const H = top + LANES.length * laneH + 18;
  const { w, ctx } = fit(canvas, H);
  ctx.clearRect(0, 0, w, H);
  const labelW = 104;
  const win = 2500;
  const t1 = Math.max(rd.t, win);
  const t0 = t1 - win;
  const X = (t: number) => labelW + ((t - t0) / win) * (w - labelW - 6);
  const text = dark ? "#cfd3d0" : C.ink;
  const muted = dark ? "#7f878e" : C.muted;
  ctx.font = `12px "IBM Plex Sans Condensed", sans-serif`;
  ctx.textBaseline = "middle";
  LANES.forEach((l, i) => {
    const y = top + i * laneH;
    ctx.fillStyle = muted;
    ctx.fillText(l.name, 0, y + laneH / 2);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)";
    ctx.fillRect(labelW, y + 2, w - labelW - 6, laneH - 4);
  });
  // time grid
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  ctx.fillStyle = muted;
  ctx.font = `11px "IBM Plex Mono", monospace`;
  for (let t = Math.ceil(t0 / 500) * 500; t <= t1; t += 500) {
    ctx.beginPath();
    ctx.moveTo(X(t), top);
    ctx.lineTo(X(t), top + LANES.length * laneH);
    ctx.stroke();
    ctx.fillText(`${(t / 1000).toFixed(1)} s`, X(t) - 14, top + LANES.length * laneH + 9);
  }

  const bar = (lane: number, a: number, b: number, color: string, label: string, flag?: string) => {
    if (b < t0) return;
    const x0 = Math.max(X(a), labelW);
    const x1 = X(b);
    const y = top + lane * laneH + 3;
    ctx.globalAlpha = flag === "cancelled" ? 0.35 : 1;
    ctx.fillStyle = flag === "fail" ? C.fail : color;
    ctx.fillRect(x0, y, Math.max(1.5, x1 - x0 - 1), laneH - 6);
    ctx.globalAlpha = 1;
    if (flag === "cancelled") {
      ctx.strokeStyle = text;
      ctx.beginPath();
      ctx.moveTo(x1 - 1, y);
      ctx.lineTo(x1 - 1, y + laneH - 6);
      ctx.stroke();
    }
    if (x1 - x0 > 28) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `11px "Courier Prime", monospace`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y, x1 - x0 - 2, laneH - 6);
      ctx.clip();
      ctx.fillText(label, x0 + 3, y + (laneH - 6) / 2 + 1);
      ctx.restore();
    }
  };

  for (const f of rd.fixations) {
    const end = f.end ?? rd.t;
    bar(0, f.start, end, f.wander ? "#8a8f95" : C.eye, rd.page.words[f.word]?.text ?? "");
  }
  const laneOf: Record<Interval["lane"], number> = { att: 1, L1: 2, L2: 3, int: 4, labile: 5, nonlabile: 6, sacc: -1 };
  for (const iv of rd.intervals) {
    const lane = laneOf[iv.lane];
    if (lane < 0) continue;
    const label = rd.page.words[iv.word]?.text ?? "";
    bar(lane, iv.t0, iv.t1 ?? rd.t, LANES[lane].color, iv.lane === "labile" || iv.lane === "nonlabile" ? `→ ${label}` : label, iv.flag);
  }
  // now
  ctx.strokeStyle = text;
  ctx.beginPath();
  ctx.moveTo(X(rd.t), top);
  ctx.lineTo(X(rd.t), top + LANES.length * laneH);
  ctx.stroke();
}

/** per-word gaze duration, model vs people, for the score panel */
export function drawWordChart(canvas: HTMLCanvasElement, human: (number | null)[], model: (number | null)[], dark: boolean) {
  const H = 110;
  const { w, ctx } = fit(canvas, H);
  ctx.clearRect(0, 0, w, H);
  const vals = [...human, ...model].filter((v): v is number => v !== null);
  const max = Math.max(400, ...vals);
  const n = human.length;
  const X = (i: number) => 28 + (i / Math.max(1, n - 1)) * (w - 34);
  const Y = (v: number) => H - 16 - (v / max) * (H - 26);
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  ctx.fillStyle = dark ? "#7f878e" : C.muted;
  ctx.font = `10px "IBM Plex Mono", monospace`;
  for (const g of [0, 200, 400]) {
    ctx.beginPath();
    ctx.moveTo(28, Y(g));
    ctx.lineTo(w - 6, Y(g));
    ctx.stroke();
    ctx.fillText(String(g), 0, Y(g) + 3);
  }
  ctx.fillText("word in passage →", 28, H - 3);
  const line = (vs: (number | null)[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let pen = false;
    vs.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      if (!pen) ctx.moveTo(X(i), Y(v));
      else ctx.lineTo(X(i), Y(v));
      pen = true;
    });
    ctx.stroke();
  };
  line(human, C.human);
  line(model, C.eye);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
