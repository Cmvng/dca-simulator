// Share-card renderer — canvas PNGs in three formats, CLEAR BLUE language:
//   x        1200×675  (X/Twitter feed)
//   square   1080×1080 (Instagram/Telegram)
//   story    1080×1920 (vertical story)
// Soft --bg ground, ONE floating white rounded card holding everything, one
// giant --ink numeral, a --blue-soft delta badge pill, scenario bars mirroring
// ScenarioBars.jsx, friendly sans type. No gradients, no monospace, no emoji
// (the ↑/↓ arrows and · separators are typography, not emoji). Three content
// variants: "plan" (default), "reality", "comparison" — each only
// re-presents numbers already computed by the simulation engine.

import { T } from "../../styles/theme.js";
import { imageProxyUrl } from "../../services/api.js";
import { fmtUSD, fmtPrice } from "../formatting/money.js";
import { MODEL_LABEL } from "../version.js";

export const CARD_FORMATS = [
  { id: "x", label: "X post · 1200×675", w: 1200, h: 675 },
  { id: "square", label: "Square · 1080×1080", w: 1080, h: 1080 },
  { id: "story", label: "Story · 1080×1920", w: 1080, h: 1920 },
];

export const CARD_CONTENTS = [
  { id: "plan", label: "My plan" },
  { id: "reality", label: "Reality check" },
  { id: "comparison", label: "DCA vs lump sum" },
];

// Canvas font stack — the app webfont with a safe fallback. Weights 400–700
// per DESIGN.md (hero is always 700).
const SANS = "'Plus Jakarta Sans', Arial, sans-serif";
const sans = (px, w = 500) => `${w} ${px}px ${SANS}`;

// the green mascot — same-origin asset, used as the default avatar
const MASCOT_URL = new URL("../../assets/mascot.svg", import.meta.url).href;

// signed figure helpers (U+2212 minus, never a hyphen)
const sPct = (v, d = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`;
const sUSD = v => `${v >= 0 ? "+" : "−"}${fmtUSD(Math.abs(v))}`;

const setLS = (ctx, v) => { ctx.letterSpacing = v; };

// Shrink a font size until `text` fits `maxW` — measureText drives layout.
function fitSize(ctx, text, maxPx, maxW, weight = 500, family = SANS) {
  let s = maxPx;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= 12) return s;
    s = Math.floor(s * 0.94);
  }
}

function loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = imageProxyUrl(src);
  });
}

function circleImage(ctx, img, cx, cy, r, bg = T.card2) {
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

// soft --line divider (never a severe rule)
function softLine(ctx, x1, y1, x2, y2, color = T.line) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// rounded-rect path (own helper — keeps us off ctx.roundRect support tables)
function rrPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function makeCard({ format = "x", content = "plan", asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice }) {
  const fmt = CARD_FORMATS.find(f => f.id === format) || CARD_FORMATS[0];
  const cv = document.createElement("canvas");
  cv.width = fmt.w; cv.height = fmt.h;
  const ctx = cv.getContext("2d");

  // "reality" needs sim.reality — fall back to the plan card without it
  let kind = content;
  if (kind === "reality" && !sim.reality?.ok) kind = "plan";
  if (kind === "comparison" && !sim.comparison?.length) kind = "plan";

  // let the canvas use the loaded Plus Jakarta Sans webfont when available
  try { await document.fonts.ready; } catch { /* Arial fallback is fine */ }

  const o = { ctx, W: fmt.w, H: fmt.h, format, asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice };

  const g = GEOM[fmt.id];

  // ground: soft blue-grey backdrop with ONE floating white rounded card
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, fmt.w, fmt.h);
  rrPath(ctx, g.m, g.m, fmt.w - g.m * 2, fmt.h - g.m * 2, g.cardR);
  ctx.fillStyle = T.card; ctx.fill();
  ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.stroke();

  const top = await drawHeader(o, g);
  const bottom = drawFooter(o, g);
  const region = { x: g.m + g.pad, y: top, w: fmt.w - (g.m + g.pad) * 2, bottom };

  if (kind === "reality") drawReality(o, g, region);
  else if (kind === "comparison") drawComparison(o, g, region);
  else await drawPlan(o, g, region);

  return cv.toDataURL("image/png");
}

// Per-format geometry — sizes only, the drawing code is shared.
const GEOM = {
  x: {
    m: 28, cardR: 36, pad: 44,
    headerCy: 104, markS: 38, wordFs: 27, coinR: 26, pfpR: 30, nameFs: 20, priceFs: 15, metaFs: 15,
    capFs: 19, capY: 188, heroFs: 86, badgeFs: 20, planFs: 16,
    barsCapY: 0, barsY: 398, barRowH: 32, barLabelFs: 15, trackH: 8, barsInline: true,
    specFs: 17, rowH: 46, valFs: 44, cmpRowH: 104,
    footFs: 14, footBase: 22, footLine: 46, cta: false, mascotCorner: 90,
  },
  square: {
    m: 32, cardR: 36, pad: 48,
    headerCy: 122, markS: 44, wordFs: 32, coinR: 30, pfpR: 36, nameFs: 24, priceFs: 17, metaFs: 17,
    capFs: 23, capY: 226, heroFs: 130, badgeFs: 24, planFs: 19,
    barsCapY: 548, barsY: 570, barRowH: 62, barLabelFs: 19, trackH: 10, barsInline: false,
    specFs: 21, rowH: 60, valFs: 60, cmpRowH: 150,
    footFs: 16, footBase: 26, footLine: 58, cta: false, mascotCorner: 0,
  },
  story: {
    m: 36, cardR: 36, pad: 52,
    headerCy: 142, markS: 46, wordFs: 34, coinR: 32, pfpR: 40, nameFs: 25, priceFs: 18, metaFs: 18,
    capFs: 26, capY: 290, heroFs: 154, badgeFs: 26, planFs: 22,
    barsCapY: 630, barsY: 655, barRowH: 76, barLabelFs: 22, trackH: 12, barsInline: false,
    specFs: 22, rowH: 62, valFs: 72, cmpRowH: 185,
    footFs: 17, footBase: 30, footLine: 66, cta: true, ctaFs: 30, ctaBase: 150, mascotCorner: 110,
  },
};

// ── Header — identity row inside the card, subtle, never a hero ──────────────
async function drawHeader({ ctx, W, asset, livePrice, userName, profileImg }, g) {
  const cy = g.headerCy;
  const x0 = g.m + g.pad, x1 = W - g.m - g.pad;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  // logo: the blue offset-bars mark (mirrors LogoMark in ui.jsx — third bar is
  // solid --blue-soft, no opacity tricks) + "cmvng" wordmark in ink
  const k = g.markS / 24, mTop = cy - g.markS / 2;
  const bar = (bx, by, bw, bh, color) => {
    rrPath(ctx, x0 + bx * k, mTop + by * k, bw * k, bh * k, 2.3 * k);
    ctx.fillStyle = color; ctx.fill();
  };
  bar(3, 8, 4.6, 13, T.bluePress);
  bar(9.7, 3, 4.6, 18, T.blue);
  bar(16.4, 11, 4.6, 10, T.blueSoft);
  ctx.font = sans(g.wordFs, 700); ctx.fillStyle = T.ink;
  ctx.fillText("cmvng", x0 + g.markS + 14, cy + g.wordFs * 0.36);

  // coin identity, right-aligned: name / live price
  const liveP = livePrice?.price || asset.current_price;
  const nameTxt = asset.name;
  const priceTxt = `${asset.symbol.toUpperCase()} · ${fmtPrice(liveP)}`;
  ctx.font = sans(g.nameFs, 600);
  const nw = ctx.measureText(nameTxt).width;
  ctx.font = sans(g.priceFs, 500);
  const pw = ctx.measureText(priceTxt).width;
  const tw = Math.max(nw, pw);
  ctx.textAlign = "right";
  ctx.font = sans(g.nameFs, 600); ctx.fillStyle = T.ink;
  ctx.fillText(nameTxt, x1, cy - 5);
  ctx.font = sans(g.priceFs, 500); ctx.fillStyle = T.ink2;
  ctx.fillText(priceTxt, x1, cy + g.priceFs + 7);

  const logoCx = x1 - tw - 18 - g.coinR;
  const logo = asset.image ? await loadImg(asset.image) : null;
  circleImage(ctx, logo, logoCx, cy, g.coinR);
  if (!logo) {
    ctx.font = sans(Math.round(g.coinR * 0.6), 600); ctx.fillStyle = T.ink2; ctx.textAlign = "center";
    ctx.fillText(asset.symbol.slice(0, 2).toUpperCase(), logoCx, cy + g.coinR * 0.22);
  }
  ctx.strokeStyle = T.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(logoCx, cy, g.coinR, 0, Math.PI * 2); ctx.stroke();

  // avatar, further left: the user's photo — or the green mascot when no photo
  // was provided (same never-reject loader: a missing asset degrades to a
  // plain soft circle, never a broken card)
  let leftEdge = logoCx - g.coinR;
  const avatar = await loadImg(profileImg || MASCOT_URL);
  const pfpCx = leftEdge - 28 - g.pfpR;
  circleImage(ctx, avatar, pfpCx, cy, g.pfpR);
  ctx.strokeStyle = T.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(pfpCx, cy, g.pfpR, 0, Math.PI * 2); ctx.stroke();
  leftEdge = pfpCx - g.pfpR;
  if (userName) {
    ctx.font = sans(g.metaFs, 600); ctx.fillStyle = T.ink2; ctx.textAlign = "right";
    ctx.fillText(userName, leftEdge - 14, cy + g.metaFs * 0.36);
  }
  ctx.textAlign = "left";

  return cy + g.pfpR + 24;
}

// ── Footer — quiet one-liner at the card's bottom edge ───────────────────────
function drawFooter({ ctx, W, H, format }, g) {
  const x0 = g.m + g.pad, x1 = W - g.m - g.pad;
  const cardBottom = H - g.m;
  const y = cardBottom - g.footLine;
  softLine(ctx, x0, y, x1, y);
  const left = `scenario simulation · not financial advice · cmvng · ${MODEL_LABEL}`;
  // shrink until both ends fit with breathing room — measureText decides
  let fs = g.footFs;
  ctx.font = sans(fs, 500);
  const rightW = () => { ctx.font = sans(fs, 700); return ctx.measureText("cmvng.app").width; };
  const leftW = () => { ctx.font = sans(fs, 500); return ctx.measureText(left).width; };
  while (fs > 10 && leftW() + rightW() + 32 > x1 - x0) fs -= 1;
  ctx.textBaseline = "alphabetic";
  ctx.font = sans(fs, 500); ctx.fillStyle = T.ink3; ctx.textAlign = "left";
  ctx.fillText(left, x0, cardBottom - g.footBase);
  ctx.font = sans(fs, 700); ctx.fillStyle = T.blue; ctx.textAlign = "right";
  ctx.fillText("cmvng.app", x1, cardBottom - g.footBase);
  ctx.textAlign = "left";
  if (format === "story" && g.cta) {
    ctx.font = sans(g.ctaFs, 700); ctx.fillStyle = T.blue; ctx.textAlign = "center";
    ctx.fillText("Build your own plan · cmvng.app", W / 2, cardBottom - g.ctaBase);
    ctx.textAlign = "left";
  }
  return y;
}

// friendly sentence-case caption
function caption(ctx, text, x, baseY, fs, color = T.ink2) {
  ctx.font = sans(fs, 600); ctx.fillStyle = color; ctx.textAlign = "left";
  ctx.fillText(text, x, baseY);
}

// giant tabular ink numeral — THE hero of every card (always w700)
function hero(ctx, text, x, baseY, maxFs, maxW) {
  const fs = fitSize(ctx, text, maxFs, maxW, 700);
  ctx.font = sans(fs, 700); ctx.fillStyle = T.ink; ctx.textAlign = "left";
  setLS(ctx, `${-(fs * 0.02)}px`);
  ctx.fillText(text, x, baseY);
  setLS(ctx, "0px");
  return baseY;
}

// rounded --blue-soft delta badge pill under the hero numeral
function deltaBadge(ctx, { x, y, fs, maxW, profit, roi }) {
  // Color ALWAYS by profit sign — never by market verdict.
  const profitColor = profit >= 0 ? T.gain : T.loss;
  const segA = `${profit >= 0 ? "↑" : "↓"} ${sUSD(profit)} · ${sPct(roi)}`;
  const segB = " · a scenario, not a forecast";
  let s = fs, wA, wB, padX;
  for (;;) {
    ctx.font = sans(s, 700); wA = ctx.measureText(segA).width;
    ctx.font = sans(s, 600); wB = ctx.measureText(segB).width;
    padX = Math.round(s * 1.1);
    if (padX * 2 + wA + wB <= maxW || s <= 12) break;
    s -= 1;
  }
  const h = Math.round(s * 2.2);
  rrPath(ctx, x, y, padX * 2 + wA + wB, h, h / 2);
  ctx.fillStyle = T.blueSoft; ctx.fill();
  const base = y + h / 2 + s * 0.36;
  ctx.textAlign = "left";
  ctx.font = sans(s, 700); ctx.fillStyle = profitColor;
  ctx.fillText(segA, x + padX, base);
  ctx.font = sans(s, 600); ctx.fillStyle = T.blue;
  ctx.fillText(segB, x + padX + wA, base);
  return y + h;
}

// label/value rows: label left in ink-2, value right in ink, soft dividers
function specRows(ctx, rows, { x, y, w, fs, rowH }) {
  rows.forEach(([label, value, color], i) => {
    const base = y + rowH * i + rowH * 0.62;
    ctx.font = sans(fs, 500); ctx.textAlign = "left"; ctx.fillStyle = T.ink2;
    ctx.fillText(label, x, base);
    ctx.font = sans(fs, 700); ctx.textAlign = "right"; ctx.fillStyle = color || T.ink;
    ctx.fillText(value, x + w, base);
    if (i < rows.length - 1) softLine(ctx, x, y + rowH * (i + 1), x + w, y + rowH * (i + 1));
  });
  ctx.textAlign = "left";
  return y + rowH * rows.length;
}

// ── Scenario bars on canvas — mirrors ScenarioBars.jsx ───────────────────────
const BAR_SHORT = {
  histWorst: "Historical worst",
  severe: "Severe downside",
  moderate: "Moderate downside",
  flat: "Flat",
  target: "Your target",
  histBest: "Strong upside",
};
// fill color per scenario — amber is allowed here ONLY, as the mid step
// between loss-red and target-blue (see DESIGN.md)
const barFill = s =>
  s.id === "histWorst" || s.id === "severe" ? T.loss
  : s.id === "moderate" ? T.amberBar
  : s.id === "flat" ? T.ink3
  : s.id === "target" ? T.blue
  : s.id === "histBest" ? T.gain
  : T.ink3;

function drawBars(ctx, scenarios, { x, y, w, fs, rowH, trackH, inline }) {
  if (!scenarios?.length) return y;
  const maxVal = Math.max(...scenarios.map(s => s.value), 1);
  const track = (tx, ty, tw, frac, color) => {
    rrPath(ctx, tx, ty, tw, trackH, trackH / 2);
    ctx.fillStyle = T.card2; ctx.fill();
    const fw = Math.max(trackH, tw * frac);
    rrPath(ctx, tx, ty, fw, trackH, trackH / 2);
    ctx.fillStyle = color; ctx.fill();
  };
  if (inline) {
    // compact single-line rows for the landscape card: label · track · value —
    // column widths come from measureText, never guessed
    ctx.font = sans(fs, 700);
    const labelW = Math.max(...scenarios.map(s => ctx.measureText(BAR_SHORT[s.id] || s.name).width));
    const valW = Math.max(...scenarios.map(s => ctx.measureText(fmtUSD(s.value)).width));
    scenarios.forEach((s, i) => {
      const base = y + rowH * i + fs * 1.1;
      const isTarget = s.id === "target";
      ctx.font = sans(fs, isTarget ? 700 : 600); ctx.textAlign = "left";
      ctx.fillStyle = T.ink;
      ctx.fillText(BAR_SHORT[s.id] || s.name, x, base);
      ctx.font = sans(fs, 700); ctx.textAlign = "right"; ctx.fillStyle = T.ink;
      ctx.fillText(fmtUSD(s.value), x + w, base);
      const tx = x + labelW + 22, tw = w - labelW - valW - 44;
      track(tx, base - fs * 0.32 - trackH / 2, tw, s.value / maxVal, barFill(s));
    });
    ctx.textAlign = "left";
    return y + rowH * scenarios.length;
  }
  // stacked rows (square/story): label + value above a full-width track
  scenarios.forEach((s, i) => {
    const rowY = y + rowH * i;
    const isTarget = s.id === "target";
    ctx.font = sans(fs, isTarget ? 700 : 600); ctx.textAlign = "left"; ctx.fillStyle = T.ink;
    ctx.fillText(BAR_SHORT[s.id] || s.name, x, rowY + fs);
    ctx.font = sans(fs, 700); ctx.textAlign = "right"; ctx.fillStyle = T.ink;
    ctx.fillText(fmtUSD(s.value), x + w, rowY + fs);
    track(x, rowY + fs + 12, w, s.value / maxVal, barFill(s));
  });
  ctx.textAlign = "left";
  return y + rowH * scenarios.length;
}

// small mascot corner — plan card only, always clear of text and data
async function mascotCorner(ctx, x, y, size) {
  const img = await loadImg(MASCOT_URL);
  if (img) ctx.drawImage(img, x, y, size, size); // square box — never stretched
}

// ── Content: "plan" (default) ────────────────────────────────────────────────
async function drawPlan(o, g, region) {
  const { ctx, W, H, format, asset, sim, targetPct, months, freqLabel } = o;
  const x0 = region.x;
  caption(ctx, `If ${asset.name} reaches ${fmtPrice(sim.targetPrice)} (${sPct(targetPct)})`, x0, g.capY, g.capFs);

  const heroBase = hero(ctx, fmtUSD(sim.targetVal), x0, g.capY + Math.round(g.heroFs * 1.05), g.heroFs, region.w);

  // Color ALWAYS by profit sign — never by market verdict.
  const badgeBottom = deltaBadge(ctx, {
    x: x0, y: heroBase + Math.round(g.badgeFs * 1.1), fs: g.badgeFs, maxW: region.w,
    profit: sim.targetProfit, roi: sim.targetROI,
  });

  // the plan itself, one friendly line (story gets full spec rows instead)
  if (format !== "story") {
    const planTxt = `${fmtUSD(sim.amtPer)} ${freqLabel.toLowerCase()} · ${months} month${months > 1 ? "s" : ""} · ${sim.entries} buys · ${fmtUSD(sim.totalInvested)} total`;
    const honesty = format === "x" ? " · Test cases, not predictions" : "";
    ctx.font = sans(g.planFs, 500); ctx.fillStyle = T.ink2; ctx.textAlign = "left";
    ctx.fillText(planTxt + honesty, x0, badgeBottom + Math.round(g.planFs * 2));
  }

  // THE graphic: scenario bars (mirrors ScenarioBars.jsx)
  if (g.barsCapY) caption(ctx, "Stress test · test cases, not predictions", x0, g.barsCapY, Math.round(g.capFs * 0.62), T.ink3);
  const barsW = g.mascotCorner && format === "x" ? region.w - g.mascotCorner - 40 : region.w;
  const barsBottom = drawBars(ctx, sim.scenarios, {
    x: x0, y: g.barsY, w: barsW, fs: g.barLabelFs, rowH: g.barRowH, trackH: g.trackH, inline: g.barsInline,
  });

  // story: plan spec sheet lower
  if (format === "story") {
    caption(ctx, "Your plan", x0, 1180, 15, T.ink3);
    specRows(ctx, [
      ["Per buy", fmtUSD(sim.amtPer)],
      ["Frequency", String(freqLabel)],
      ["Duration", `${months} month${months > 1 ? "s" : ""} · ${sim.entries} buys`],
      ["Total invested", fmtUSD(sim.totalInvested)],
      ["Avg entry price", fmtPrice(sim.avgEntry)],
    ], { x: x0, y: 1205, w: region.w, fs: g.specFs, rowH: g.rowH });
  }

  // mascot corner — bottom-right of the card, in clear air only
  if (g.mascotCorner) {
    const mx = W - g.m - g.pad - g.mascotCorner;
    const my = format === "story"
      ? H - g.m - g.ctaBase - 60 - g.mascotCorner
      : Math.round((g.barsY + barsBottom) / 2 - g.mascotCorner / 2);
    await mascotCorner(ctx, mx, my, g.mascotCorner);
  }
}

// ── Content: "reality" — the verdict word is the hero ────────────────────────
function drawReality(o, g, region) {
  const { ctx, sim, targetPct } = o;
  const x0 = region.x;
  const r = sim.reality;
  caption(ctx, `Reality check · target ${sPct(targetPct)} over ${sim.windowDays} days`, x0, g.capY, g.capFs);

  // verdict word at numeral scale — Modest / Moderate / Ambitious / Extreme
  const raw = String(r.label).split(" ").pop().toLowerCase();
  const word = raw.charAt(0).toUpperCase() + raw.slice(1);
  const heroBase = hero(ctx, word, x0, g.capY + Math.round(g.heroFs * 1.05), g.heroFs, region.w);

  const rowsY = heroBase + Math.round(g.specFs * 2.2);
  const rowW = Math.min(region.w, Math.round(560 * (g.specFs / 17)));
  const bottom = specRows(ctx, [
    ["Windows sampled", String(r.count)],
    ["Typical move", `±${Math.round(r.typicalPct)}%`],
    ["Largest gain", sPct(Math.round(r.largestGainPct)), T.gain],
    ["Largest drop", sPct(Math.round(r.largestLossPct)), T.loss],
  ], { x: x0, y: rowsY, w: rowW, fs: g.specFs, rowH: g.rowH });

  ctx.font = sans(Math.round(g.capFs * 0.8), 500); ctx.fillStyle = T.ink3; ctx.textAlign = "left";
  ctx.fillText("Historical observations, not probabilities.", x0, bottom + Math.round(g.capFs * 2));
}

// ── Content: "comparison" — dca vs lump sum (vs hybrid) ──────────────────────
function drawComparison(o, g, region) {
  const { ctx, sim, targetPct } = o;
  const x0 = region.x;
  caption(ctx, `DCA vs lump sum · same $, same coin, valued at ${sPct(targetPct)}`, x0, g.capY, g.capFs);

  const rows = sim.comparison;
  const leader = rows.reduce((a, b) => (b.valueAtTarget > a.valueAtTarget ? b : a), rows[0]);
  let y = g.capY + Math.round(g.capFs * 1.3);
  rows.forEach((s, i) => {
    const isLeader = s.id === leader.id;
    const nameBase = y + Math.round(g.specFs * 1.35);
    ctx.font = sans(g.specFs, 600); ctx.textAlign = "left";
    ctx.fillStyle = isLeader ? T.ink : T.ink2;
    ctx.fillText(s.name, x0, nameBase);
    if (isLeader) {
      // small --blue-soft "ahead" chip next to the leading strategy
      const nameW = ctx.measureText(s.name).width;
      const chipFs = Math.round(g.specFs * 0.72);
      ctx.font = sans(chipFs, 700);
      const chipW = ctx.measureText("Ahead").width + chipFs * 1.6;
      const chipH = Math.round(chipFs * 1.9);
      rrPath(ctx, x0 + nameW + 14, nameBase - chipH + chipFs * 0.42, chipW, chipH, chipH / 2);
      ctx.fillStyle = T.blueSoft; ctx.fill();
      ctx.fillStyle = T.blue;
      ctx.fillText("Ahead", x0 + nameW + 14 + chipFs * 0.8, nameBase - chipH + chipFs * 0.42 + chipH / 2 + chipFs * 0.36);
    }

    const valBase = nameBase + Math.round(g.valFs * 1.1);
    ctx.font = sans(g.valFs, 700); ctx.fillStyle = T.ink; ctx.textAlign = "left";
    ctx.fillText(fmtUSD(s.valueAtTarget), x0, valBase);
    // Color ALWAYS by profit sign — never by market verdict.
    ctx.font = sans(Math.round(g.valFs * 0.42), 700); ctx.textAlign = "right";
    ctx.fillStyle = s.roiAtTarget >= 0 ? T.gain : T.loss;
    ctx.fillText(sPct(s.roiAtTarget), x0 + region.w, valBase);
    ctx.textAlign = "left";

    y += g.cmpRowH;
    if (i < rows.length - 1) softLine(ctx, x0, y - Math.round(g.cmpRowH * 0.16), x0 + region.w, y - Math.round(g.cmpRowH * 0.16));
  });

  ctx.font = sans(Math.round(g.capFs * 0.8), 500); ctx.fillStyle = T.ink3; ctx.textAlign = "left";
  ctx.fillText("Which strategy wins depends on the path — neither always wins.", x0, y + Math.round(g.capFs * 1.6));
}
