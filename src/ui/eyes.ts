/**
 * A pair of synthetic eyes seen from the outside, driven by the model: the irises jump with each
 * saccade, the lids follow the gaze down the page, the eyes blink now and then, and the pupil
 * apertures open with processing effort (illustrative: E-Z Reader has no pupil, so this is a
 * readout of how hard the attended word is, not a fitted measure). A small HUD tracks each eye.
 */
import type { Reader } from "../engine/model.ts";
import { posToPx } from "../engine/text.ts";
import { fit, pageExtent } from "./draw.ts";

const CYAN = "#3ef0ff";
const MAGENTA = "#ff3ea5";
const AMBER = "#ffb23e";

// fixed iris texture, so the eyes don't shimmer
const FIBERS = Array.from({ length: 120 }, (_, i) => {
  const r = Math.sin(i * 12.9898) * 43758.5453;
  const f = r - Math.floor(r);
  return { a: (i / 120) * Math.PI * 2 + f * 0.04, len: 0.5 + f * 0.5, alpha: 0.15 + f * 0.45 };
});
// circuit traces on the synthetic skin
const TRACES = Array.from({ length: 16 }, (_, i) => {
  const r = Math.sin(i * 91.17) * 24634.6345;
  const f = r - Math.floor(r);
  const g = Math.sin(i * 37.7) * 0.5 + 0.5;
  return { x: f, y: g, len: 0.05 + f * 0.12, up: i % 3 === 0 };
});

let pupil = 0.4;
let blinkUntil = -1;
let nextBlink = 2500;
let lastSim = 0;

export function drawEyes(canvas: HTMLCanvasElement, rd: Reader, cssH: number) {
  const { w, ctx } = fit(canvas, cssH);
  const H = cssH;
  ctx.clearRect(0, 0, w, H);

  // gaze from the model's eye position on the page
  const page = rd.page;
  const ext = pageExtent(page);
  const e = rd.eye;
  const p = posToPx(page, e.line, e.col);
  const gx = ((p.x - ext.x0) / (ext.x1 - ext.x0)) * 2 - 1;
  const gy = page.lineY.length > 1 ? (e.line / (page.lineY.length - 1)) * 2 - 1 : 0;

  // effort → pupil (smoothed in model time)
  const dt = Math.max(0, rd.t - lastSim);
  if (rd.t < lastSim) {
    blinkUntil = -1;
    nextBlink = rd.t + 2500;
  }
  lastSim = rd.t;
  const ws = rd.words[rd.att];
  let effort = 0;
  if (ws && ws.stage !== "done") effort = Math.min(1, Math.max(0, (ws.l1Need - 60) / 160));
  if (rd.intervals.some((iv) => iv.flag === "fail" && iv.t1 !== null && rd.t - iv.t1 < 400)) effort = 1;
  pupil += (0.3 + 0.24 * effort - pupil) * (1 - Math.exp(-dt / 350));

  // blinks: every few seconds, preferably as a saccade starts
  if (rd.t > nextBlink && e.moving && blinkUntil < rd.t) {
    blinkUntil = rd.t + 140;
    nextBlink = rd.t + 2500 + ((rd.t * 7919) % 3500);
  }
  const blink = blinkUntil > rd.t ? Math.sin((1 - (blinkUntil - rd.t) / 140) * Math.PI) : 0;

  // synthetic skin: dark, cool, with faint glowing traces
  const skin = ctx.createLinearGradient(0, 0, w, H);
  skin.addColorStop(0, "#151024");
  skin.addColorStop(0.5, "#1c2233");
  skin.addColorStop(1, "#0d1a22");
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, w, H);
  ctx.lineWidth = 1;
  for (const t of TRACES) {
    const x = t.x * w;
    const y = t.y * H;
    ctx.strokeStyle = "rgba(62,240,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + t.len * w, y);
    ctx.lineTo(x + t.len * w + 10, y + (t.up ? -10 : 10));
    ctx.stroke();
    ctx.fillStyle = "rgba(62,240,255,0.35)";
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  const vign = ctx.createRadialGradient(w / 2, H * 0.55, H * 0.2, w / 2, H * 0.55, w * 0.7);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(3,4,8,0.9)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, w, H);

  const eyeW = Math.min(w * 0.3, H * 1.05);
  const eyeH = eyeW * 0.42;
  const cy = H * 0.56;
  const fx = rd.fixations.at(-1)!;
  const target = rd.nonlabile ?? rd.labile;
  for (const side of [-1, 1]) {
    const cx = w / 2 + side * eyeW * 0.68;
    // slight convergence: both eyes turn a touch toward the nose
    const iris = drawOne(ctx, cx, cy, eyeW, eyeH, gx - side * 0.04, gy, pupil, blink, side, e.moving);
    // HUD readouts
    ctx.font = `10px "IBM Plex Mono", monospace`;
    ctx.fillStyle = "rgba(62,240,255,0.75)";
    const hx = cx - eyeW / 2;
    const hy = cy + eyeH * 1.25;
    if (side === -1) {
      ctx.fillText(`FIX ${e.moving ? "---" : String(Math.round(rd.t - fx.start)).padStart(3, "0")} ms`, hx, hy);
      ctx.fillText(`ON  ${(page.words[fx.word]?.text ?? "").slice(0, 14)}`, hx, hy + 13);
    } else {
      ctx.fillText(`PUPIL ${(pupil * 100).toFixed(0)}%`, hx, hy);
      ctx.fillStyle = target ? `rgba(255,62,165,0.85)` : "rgba(62,240,255,0.4)";
      ctx.fillText(target ? `SACC → ${page.words[target.target].text.slice(0, 12)}${target.stage === "labile" ? " ?" : " !"}` : "SACC idle", hx, hy + 13);
    }
    // reticle around the iris
    const r = eyeH * 0.95;
    ctx.strokeStyle = e.moving ? "rgba(255,62,165,0.8)" : "rgba(62,240,255,0.55)";
    ctx.lineWidth = 1;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(iris.x + sx * r, iris.y + sy * r * 0.6);
      ctx.lineTo(iris.x + sx * r, iris.y + sy * r);
      ctx.lineTo(iris.x + sx * r * 0.6, iris.y + sy * r);
      ctx.stroke();
    }
  }

  // scanlines
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, w, 1);
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  W: number,
  H: number,
  gx: number,
  gy: number,
  pupil: number,
  blink: number,
  side: number,
  moving: boolean,
) {
  const L = cx - W / 2;
  const R = cx + W / 2;
  const open = (1 - blink) * (1 - 0.18 * Math.max(0, gy + 0.2));
  const topY = cy - H * 1.05 * open;
  const botY = cy + H * 0.85 * (1 - blink * 0.85);
  const inner = side === -1 ? R : L;
  const yL = cy + (inner === L ? H * 0.06 : 0);
  const yR = cy + (inner === R ? H * 0.06 : 0);
  const upper = () => {
    ctx.moveTo(L, yL);
    ctx.bezierCurveTo(L + W * 0.22, topY, R - W * 0.25, topY, R, yR);
  };
  const almond = () => {
    ctx.beginPath();
    upper();
    ctx.bezierCurveTo(R - W * 0.25, botY, L + W * 0.25, botY, L, yL);
    ctx.closePath();
  };

  // brow: a dark bar with a lit edge
  ctx.lineCap = "round";
  ctx.strokeStyle = "#07080d";
  ctx.lineWidth = H * 0.2;
  ctx.beginPath();
  ctx.moveTo(L - W * 0.04, cy - H * 1.55);
  ctx.quadraticCurveTo(cx + side * W * 0.05, cy - H * 2.1, R + W * 0.06, cy - H * 1.6 + (side === -1 ? H * 0.1 : -H * 0.1));
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,62,165,0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
  almond();
  ctx.clip();
  // sclera: cool and faintly lit from inside
  const sc = ctx.createRadialGradient(cx, cy, H * 0.2, cx, cy, W * 0.6);
  sc.addColorStop(0, "#d9e6ef");
  sc.addColorStop(0.7, "#9fb3c4");
  sc.addColorStop(1, "#3c4a60");
  ctx.fillStyle = sc;
  ctx.fillRect(L, cy - H * 1.2, W, H * 2.4);

  // iris
  const Ri = H * 0.74;
  const ix = cx + gx * W * 0.27;
  const iy = cy + gy * H * 0.22;
  const drawIris = (dx: number, tint: string | null) => {
    const x = ix + dx;
    const ig = ctx.createRadialGradient(x, iy, Ri * 0.1, x, iy, Ri);
    ig.addColorStop(0, tint ?? "#ffb23e");
    ig.addColorStop(0.35, tint ?? "#ff3ea5");
    ig.addColorStop(0.7, tint ?? "#3a2cff");
    ig.addColorStop(1, "#05060c");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(x, iy, Ri, 0, Math.PI * 2);
    ctx.fill();
  };
  if (moving) {
    // chromatic split while the eye is in flight
    ctx.globalAlpha = 0.5;
    drawIris(-4, "#ff2a6d");
    drawIris(4, "#2af6ff");
    ctx.globalAlpha = 1;
  }
  drawIris(0, null);
  const rp = Ri * pupil;
  for (const f of FIBERS) {
    ctx.strokeStyle = `rgba(62,240,255,${f.alpha * 0.55})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(ix + Math.cos(f.a) * rp * 1.15, iy + Math.sin(f.a) * rp * 1.15);
    const r2 = rp + (Ri - rp) * f.len;
    ctx.lineTo(ix + Math.cos(f.a) * r2, iy + Math.sin(f.a) * r2);
    ctx.stroke();
  }
  // lens markings: a tick ring
  ctx.strokeStyle = "rgba(62,240,255,0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const l = i % 4 === 0 ? 0.14 : 0.07;
    ctx.beginPath();
    ctx.moveTo(ix + Math.cos(a) * Ri * 0.84, iy + Math.sin(a) * Ri * 0.84);
    ctx.lineTo(ix + Math.cos(a) * Ri * (0.84 - l), iy + Math.sin(a) * Ri * (0.84 - l));
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(ix, iy, Ri * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // pupil: a six-blade aperture
  ctx.fillStyle = "#020205";
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = ix + Math.cos(a) * rp;
    const y = iy + Math.sin(a) * rp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,178,62,0.7)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(ix, iy, Math.max(1.2, rp * 0.08), 0, Math.PI * 2);
  ctx.fill();
  // reflection
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(cx - W * 0.06, cy - H * 0.3, Ri * 0.16, Ri * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // shadow under the upper lid
  const sh = ctx.createLinearGradient(0, topY, 0, topY + H * 0.9);
  sh.addColorStop(0, "rgba(5,4,14,0.75)");
  sh.addColorStop(1, "rgba(5,4,14,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(L, topY - 2, W, H * 1.2);
  ctx.restore();

  // neon lid line
  ctx.save();
  ctx.shadowColor = MAGENTA;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = MAGENTA;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  upper();
  ctx.lineTo(R + W * 0.08, yR - H * 0.18);
  ctx.stroke();
  ctx.shadowColor = CYAN;
  ctx.strokeStyle = "rgba(62,240,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(R, yR);
  ctx.bezierCurveTo(R - W * 0.25, botY, L + W * 0.25, botY, L, yL);
  ctx.stroke();
  ctx.restore();

  return { x: ix, y: iy };
}
