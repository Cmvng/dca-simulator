// Share-card renderer — canvas PNGs in three formats, INSTRUMENT language:
//   x        1200×675  (X/Twitter feed)
//   square   1080×1080 (Instagram/Telegram)
//   story    1080×1920 (vertical story)
// --paper ground, hairline rules, one giant --ink numeral, mono technical
// footer. No gradients, no shadows, no pills, no emoji. Three content
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

// Canvas font stacks — two weights only (400/500), per DESIGN.md.
const SANS = "Inter, Arial, sans-serif";
const MONO = "Menlo, Consolas, monospace";
const sans = (px, w = 400) => `${w} ${px}px ${SANS}`;
const mono = px => `400 ${px}px ${MONO}`;

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

function circleImage(ctx, img, cx, cy, r, bg = T.paper2) {
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

function hairline(ctx, x1, y1, x2, y2, color = T.line) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
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

  const o = { ctx, W: fmt.w, H: fmt.h, format, asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice };

  // ground — paper, nothing else
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, fmt.w, fmt.h);

  const g = GEOM[fmt.id];
  const top = await drawHeader(o, g);
  const bottom = drawFooter(o, g);
  const region = { x: g.pad, y: top, w: fmt.w - g.pad * 2, bottom };

  if (kind === "reality") drawReality(o, g, region);
  else if (kind === "comparison") drawComparison(o, g, region);
  else drawPlan(o, g, region);

  return cv.toDataURL("image/png");
}

// Per-format geometry — sizes only, the drawing code is shared.
const GEOM = {
  x: {
    pad: 48, headerCy: 78, headerBottom: 136, coinR: 28, pfpR: 34,
    wordFs: 28, headMono: 15, nameFs: 20, priceFs: 15,
    capFs: 19, heroFs: 132, subFs: 22, planFs: 18,
    rulerFs: 15, rulerR: 7, rulerLabelY: 448, rulerY: 462,
    specFs: 17, rowH: 44, valFs: 50, cmpRowH: 110,
    footFs: 14, footBase: 26, footLine: 58, cta: false,
  },
  square: {
    pad: 64, headerCy: 106, headerBottom: 180, coinR: 32, pfpR: 40,
    wordFs: 34, headMono: 17, nameFs: 24, priceFs: 18,
    capFs: 23, heroFs: 160, subFs: 27, planFs: 22,
    rulerFs: 19, rulerR: 9, rulerLabelY: 660, rulerY: 682,
    specFs: 21, rowH: 56, valFs: 64, cmpRowH: 150,
    footFs: 16, footBase: 34, footLine: 72, cta: false,
  },
  story: {
    pad: 64, headerCy: 112, headerBottom: 192, coinR: 34, pfpR: 40,
    wordFs: 36, headMono: 18, nameFs: 25, priceFs: 19,
    capFs: 25, heroFs: 176, subFs: 29, planFs: 24,
    rulerFs: 22, rulerR: 11, rulerLabelY: 806, rulerY: 830,
    specFs: 23, rowH: 62, valFs: 76, cmpRowH: 190,
    footFs: 17, footBase: 40, footLine: 92, cta: true, ctaFs: 28, ctaBase: 150,
  },
};

// ── Header — identity data, kept subtle, never a hero ────────────────────────
async function drawHeader({ ctx, W, asset, livePrice, userName, profileImg }, g) {
  const cy = g.headerCy;
  const base = cy + g.wordFs * 0.36;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  // wordmark: "cmvng" in ink, the period in blue (the logo dot)
  ctx.font = sans(g.wordFs, 500); ctx.fillStyle = T.ink;
  ctx.fillText("cmvng", g.pad, base);
  const w1 = ctx.measureText("cmvng").width;
  ctx.fillStyle = T.blue; ctx.fillText(".", g.pad + w1, base);
  const w2 = w1 + ctx.measureText(".").width;
  ctx.font = mono(g.headMono); ctx.fillStyle = T.ink3; setLS(ctx, "0.8px");
  ctx.fillText("dca simulator", g.pad + w2 + 16, base);
  setLS(ctx, "0px");

  // coin identity, right-aligned: name / ticker · live price (mono)
  const liveP = livePrice?.price || asset.current_price;
  const nameTxt = asset.name;
  const priceTxt = `${asset.symbol.toLowerCase()} · ${fmtPrice(liveP)}`;
  ctx.font = sans(g.nameFs, 500);
  const nw = ctx.measureText(nameTxt).width;
  ctx.font = mono(g.priceFs);
  const pw = ctx.measureText(priceTxt).width;
  const tw = Math.max(nw, pw);
  ctx.textAlign = "right";
  ctx.font = sans(g.nameFs, 500); ctx.fillStyle = T.ink;
  ctx.fillText(nameTxt, W - g.pad, cy - 5);
  ctx.font = mono(g.priceFs); ctx.fillStyle = T.ink2;
  ctx.fillText(priceTxt, W - g.pad, cy + g.priceFs + 7);

  const logoCx = W - g.pad - tw - 18 - g.coinR;
  const logo = asset.image ? await loadImg(asset.image) : null;
  circleImage(ctx, logo, logoCx, cy, g.coinR);
  if (!logo) {
    ctx.font = mono(Math.round(g.coinR * 0.62)); ctx.fillStyle = T.ink2; ctx.textAlign = "center";
    ctx.fillText(asset.symbol.slice(0, 2).toLowerCase(), logoCx, cy + g.coinR * 0.22);
  }
  ctx.strokeStyle = T.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(logoCx, cy, g.coinR, 0, Math.PI * 2); ctx.stroke();

  // optional PFP + name, further left — small, subtle
  let leftEdge = logoCx - g.coinR;
  if (profileImg) {
    const pimg = await loadImg(profileImg);
    const pfpCx = leftEdge - 32 - g.pfpR;
    circleImage(ctx, pimg, pfpCx, cy, g.pfpR);
    ctx.strokeStyle = T.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pfpCx, cy, g.pfpR, 0, Math.PI * 2); ctx.stroke();
    leftEdge = pfpCx - g.pfpR;
  }
  if (userName) {
    ctx.font = mono(g.headMono); ctx.fillStyle = T.ink2; ctx.textAlign = "right";
    ctx.fillText(userName, leftEdge - 14, cy + g.headMono * 0.36);
  }

  hairline(ctx, g.pad, g.headerBottom, W - g.pad, g.headerBottom);
  return g.headerBottom;
}

// ── Footer — mono technical line, every card ─────────────────────────────────
function drawFooter({ ctx, W, H, format }, g) {
  const y = H - g.footLine;
  hairline(ctx, g.pad, y, W - g.pad, y);
  const left = `scenario simulation · not financial advice · cmvng · ${MODEL_LABEL.toLowerCase()}`;
  // shrink until both ends fit with breathing room — measureText decides
  let fs = g.footFs;
  ctx.font = mono(fs);
  while (fs > 10 && ctx.measureText(left).width + ctx.measureText("cmvng.app").width + 32 > W - g.pad * 2) {
    fs -= 1; ctx.font = mono(fs);
  }
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = T.ink3; ctx.textAlign = "left"; setLS(ctx, "0.5px");
  ctx.fillText(left, g.pad, H - g.footBase);
  ctx.fillStyle = T.ink; ctx.textAlign = "right";
  ctx.fillText("cmvng.app", W - g.pad, H - g.footBase);
  setLS(ctx, "0px");
  if (format === "story" && g.cta) {
    ctx.font = mono(g.ctaFs); ctx.fillStyle = T.ink; ctx.textAlign = "center"; setLS(ctx, "0.5px");
    ctx.fillText("build your own plan · cmvng.app", W / 2, H - g.ctaBase);
    setLS(ctx, "0px");
  }
  return y;
}

// mono whisper caption
function caption(ctx, text, x, baseY, fs) {
  ctx.font = mono(fs); ctx.fillStyle = T.ink3; ctx.textAlign = "left"; setLS(ctx, "1px");
  ctx.fillText(text, x, baseY);
  setLS(ctx, "0px");
}

// giant tabular ink numeral — THE hero of every card
function hero(ctx, text, x, baseY, maxFs, maxW) {
  const fs = fitSize(ctx, text, maxFs, maxW);
  ctx.font = sans(fs, 500); ctx.fillStyle = T.ink; ctx.textAlign = "left";
  setLS(ctx, `${-(fs * 0.045)}px`);
  ctx.fillText(text, x, baseY);
  setLS(ctx, "0px");
  return baseY;
}

// spec-sheet rows: mono label left / mono figure right, --line-2 dividers
function specRows(ctx, rows, { x, y, w, fs, rowH }) {
  rows.forEach(([label, value, color], i) => {
    const base = y + rowH * i + rowH * 0.62;
    ctx.font = mono(fs); ctx.textAlign = "left"; ctx.fillStyle = T.ink2; setLS(ctx, "0.5px");
    ctx.fillText(label, x, base);
    setLS(ctx, "0px");
    ctx.textAlign = "right"; ctx.fillStyle = color || T.ink;
    ctx.fillText(value, x + w, base);
    if (i < rows.length - 1) hairline(ctx, x, y + rowH * (i + 1), x + w, y + rowH * (i + 1), T.line2);
  });
  return y + rowH * rows.length;
}

// ── Outcome ruler on canvas — mirrors ScenarioRuler.jsx ─────────────────────
const SHORT = { histWorst: "worst-like", severe: "−50%", moderate: "−20%", flat: "flat", target: "target", histBest: "best-like" };
const markerColor = s =>
  s.id === "severe" ? T.lossDeep
  : s.movePct < 0 ? T.loss
  : s.movePct > 0 ? T.gain
  : T.ink3;

function diamond(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function drawRuler(ctx, scenarios, { x, y, w, fs, r }) {
  if (!scenarios?.length) return y;
  const sorted = [...scenarios].sort((a, b) => a.movePct - b.movePct);
  const min = sorted[0].movePct, max = sorted[sorted.length - 1].movePct;
  const span = max - min || 1;
  const padX = Math.round(w * 0.05);
  const px = m => x + padX + ((m - min) / span) * (w - padX * 2);
  const lineH = Math.round(fs * 1.35);
  const stackH = lineH * 3;             // room for a 3-line stack (target)
  const axisY = y + stackH + Math.round(fs * 0.6);

  // one hairline axis with end ticks
  hairline(ctx, px(min), axisY, px(max), axisY);
  hairline(ctx, px(min), axisY - 5, px(min), axisY + 5);
  hairline(ctx, px(max), axisY - 5, px(max), axisY + 5);

  ctx.font = mono(fs);
  sorted.forEach((s, i) => {
    const isTarget = s.id === "target";
    const cx = px(s.movePct);
    const name = SHORT[s.id] || String(s.name || "").toLowerCase();
    const value = fmtUSD(s.value);
    const lines = [
      [name, isTarget ? T.ink : T.ink3],
      [value, T.ink],
    ];
    if (isTarget) lines.push([sPct(Math.round(s.roiPct)), s.roiPct >= 0 ? T.gain : T.loss]);

    // marker: solid ink target, hairline-outlined diamond otherwise
    if (isTarget) {
      diamond(ctx, cx, axisY, r * 1.35);
      ctx.fillStyle = T.ink; ctx.fill();
    } else {
      diamond(ctx, cx, axisY, r);
      ctx.fillStyle = T.paper; ctx.fill();
      ctx.strokeStyle = markerColor(s); ctx.lineWidth = Math.max(1.2, fs / 11); ctx.stroke();
    }

    // clamp the stack center so text never leaves the card — measureText
    const half = Math.max(...lines.map(l => ctx.measureText(l[0]).width)) / 2;
    const lx = Math.max(x + half, Math.min(x + w - half, cx));
    const above = i % 2 === 0;
    ctx.textAlign = "center";
    lines.forEach(([text, color], k) => {
      const by = above
        ? axisY - r * 1.5 - 8 - lineH * (lines.length - 1 - k)
        : axisY + r * 1.5 + fs + 8 + lineH * k;
      ctx.fillStyle = color;
      ctx.fillText(text, lx, by);
    });
  });
  ctx.textAlign = "left";
  return axisY + r * 1.5 + fs + 8 + lineH * 2;
}

// ── Content: "plan" (default) ────────────────────────────────────────────────
function drawPlan(o, g, region) {
  const { ctx, W, format, asset, sim, targetPct, months, freqLabel } = o;
  const { pad } = g;
  const capBase = region.y + Math.round(g.capFs * (format === "x" ? 2.4 : 4.2));
  caption(ctx, `if ${asset.symbol.toLowerCase()} reaches ${fmtPrice(sim.targetPrice)} (${sPct(targetPct)})`, pad, capBase, g.capFs);

  const heroBase = hero(ctx, fmtUSD(sim.targetVal), pad, capBase + Math.round(g.heroFs * 1.06), g.heroFs, region.w);

  // Color ALWAYS by profit sign — never by market verdict.
  const profitColor = sim.targetProfit >= 0 ? T.gain : T.loss;
  const subBase = heroBase + Math.round(g.subFs * 1.9);
  ctx.font = mono(g.subFs); ctx.textAlign = "left";
  const part1 = `${sUSD(sim.targetProfit)} · ${sPct(sim.targetROI)}`;
  ctx.fillStyle = profitColor;
  ctx.fillText(part1, pad, subBase);
  const p1w = ctx.measureText(part1).width;
  ctx.fillStyle = T.ink3;
  ctx.fillText(" · a scenario, not a forecast", pad + p1w, subBase);

  // the plan itself, one mono line
  const planBase = subBase + Math.round(g.planFs * 2.1);
  ctx.font = mono(g.planFs); ctx.fillStyle = T.ink2;
  ctx.fillText(
    `${fmtUSD(sim.amtPer)} ${freqLabel.toLowerCase()} · ${months} month${months > 1 ? "s" : ""} · ${sim.entries} buys · ${fmtUSD(sim.totalInvested)} total`,
    pad, planBase,
  );

  // THE graphic: the outcome ruler
  caption(ctx, "outcome ruler · test cases, not predictions", pad, g.rulerLabelY, Math.round(g.capFs * 0.8));
  drawRuler(ctx, sim.scenarios, { x: pad, y: g.rulerY, w: region.w, fs: g.rulerFs, r: g.rulerR });

  // story: plan spec sheet lower
  if (format === "story") {
    const rows = [
      ["per buy", fmtUSD(sim.amtPer)],
      ["frequency", String(freqLabel).toLowerCase()],
      ["duration", `${months} month${months > 1 ? "s" : ""} · ${sim.entries} buys`],
      ["total invested", fmtUSD(sim.totalInvested)],
      ["avg entry price", fmtPrice(sim.avgEntry)],
    ];
    specRows(ctx, rows, { x: pad, y: 1210, w: W - pad * 2, fs: g.specFs, rowH: g.rowH });
  }
}

// ── Content: "reality" — the verdict word is the hero ────────────────────────
function drawReality(o, g, region) {
  const { ctx, format, sim, targetPct } = o;
  const { pad } = g;
  const r = sim.reality;
  const capBase = region.y + Math.round(g.capFs * (format === "x" ? 2.4 : 4.2));
  caption(ctx, `reality check · target ${sPct(targetPct)} over ${sim.windowDays} days`, pad, capBase, g.capFs);

  // verdict word at numeral scale — modest / moderate / ambitious / extreme
  const word = String(r.label).split(" ").pop().toLowerCase();
  const heroBase = hero(ctx, word, pad, capBase + Math.round(g.heroFs * 1.06), g.heroFs, region.w);

  const rowsY = heroBase + Math.round(g.specFs * 1.6);
  const rowW = Math.min(region.w, Math.round(560 * (g.specFs / 17)));
  const bottom = specRows(ctx, [
    ["windows sampled", String(r.count)],
    ["typical move", `±${Math.round(r.typicalPct)}%`],
    ["largest gain", sPct(Math.round(r.largestGainPct)), T.gain],
    ["largest drop", sPct(Math.round(r.largestLossPct)), T.loss],
  ], { x: pad, y: rowsY, w: rowW, fs: g.specFs, rowH: g.rowH });

  caption(ctx, "historical observations, not probabilities", pad, bottom + Math.round(g.capFs * 2), Math.round(g.capFs * 0.85));
}

// ── Content: "comparison" — dca vs lump sum (vs hybrid) ──────────────────────
function drawComparison(o, g, region) {
  const { ctx, format, sim, targetPct } = o;
  const { pad } = g;
  const capBase = region.y + Math.round(g.capFs * (format === "x" ? 2.4 : 3.2));
  caption(ctx, `dca vs lump sum · same $, same coin, valued at ${sPct(targetPct)}`, pad, capBase, g.capFs);

  const rows = sim.comparison;
  const leader = rows.reduce((a, b) => (b.valueAtTarget > a.valueAtTarget ? b : a), rows[0]);
  let y = capBase + Math.round(g.capFs * 1.6);
  rows.forEach((s, i) => {
    const nameBase = y + Math.round(g.specFs * 1.5);
    ctx.font = mono(g.specFs); ctx.textAlign = "left"; setLS(ctx, "0.5px");
    ctx.fillStyle = s.id === leader.id ? T.ink : T.ink2;
    ctx.fillText(`${s.name.toLowerCase()}${s.id === leader.id ? " · ahead" : ""}`, pad, nameBase);
    setLS(ctx, "0px");

    const valBase = nameBase + Math.round(g.valFs * 1.12);
    ctx.font = mono(g.valFs); ctx.fillStyle = T.ink;
    ctx.fillText(fmtUSD(s.valueAtTarget), pad, valBase);
    // Color ALWAYS by profit sign — never by market verdict.
    ctx.font = mono(Math.round(g.valFs * 0.42)); ctx.textAlign = "right";
    ctx.fillStyle = s.roiAtTarget >= 0 ? T.gain : T.loss;
    ctx.fillText(sPct(s.roiAtTarget), pad + region.w, valBase);
    ctx.textAlign = "left";

    y += g.cmpRowH;
    if (i < rows.length - 1) hairline(ctx, pad, y - Math.round(g.cmpRowH * 0.16), pad + region.w, y - Math.round(g.cmpRowH * 0.16), T.line2);
  });

  caption(ctx, "which strategy wins depends on the path — neither always wins", pad, y + Math.round(g.capFs * 1.6), Math.round(g.capFs * 0.85));
}
