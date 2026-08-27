// Share-card renderer — canvas PNGs in three formats:
//   x        1200×675  (X/Twitter feed, v1-preserved layout)
//   square   1080×1080 (Instagram/Telegram)
//   story    1080×1920 (vertical story)
// All formats carry CMVNG branding, plan, headline result, scenarios and the
// "Not financial advice" footer. Nothing implies guaranteed returns.

import { imageProxyUrl } from "../../services/api.js";
import { fmtUSD, fmtPrice } from "../formatting/money.js";
import { fmtPct } from "../formatting/percentage.js";
import { MODEL_LABEL } from "../version.js";

export const CARD_FORMATS = [
  { id: "x", label: "X post · 1200×675", w: 1200, h: 675 },
  { id: "square", label: "Square · 1080×1080", w: 1080, h: 1080 },
  { id: "story", label: "Story · 1080×1920", w: 1080, h: 1920 },
];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
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

function circleImage(ctx, img, cx, cy, r, bg = "#15803D") {
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

function scenarioBoxes(sim) {
  return [
    { label: "Price stays flat", val: sim.units * sim.refPrice, change: "±0%", note: "At live price", c: "#B45309", bg: "#FFFBEB", brd: "#FDE68A" },
    { label: "Drops 20%", val: sim.downVal, change: "-20%", note: `−${fmtUSD(Math.abs(sim.downLoss))}`, c: "#DC2626", bg: "#FEF2F2", brd: "#FECACA" },
    { label: "Crashes 50%", val: sim.down50Val, change: "-50%", note: `−${fmtUSD(Math.abs(sim.down50Loss))}`, c: "#9F1239", bg: "#FFF1F2", brd: "#FDA4AF" },
  ];
}

function drawScenarioRow(ctx, sim, x, y, w, h, dark) {
  const colW = w / 3;
  scenarioBoxes(sim).forEach((sc, i) => {
    const sx = x + i * colW, sw = colW - 10;
    rr(ctx, sx, y, sw, h, 10); ctx.fillStyle = sc.bg; ctx.fill();
    ctx.strokeStyle = sc.brd; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = sc.c; ctx.font = "bold 20px Arial"; ctx.textAlign = "left";
    ctx.fillText(sc.label, sx + 14, y + 30);
    ctx.fillStyle = dark; ctx.font = "bold 34px Arial";
    ctx.fillText(fmtUSD(sc.val), sx + 14, y + 74);
    ctx.fillStyle = sc.c; ctx.font = "bold 20px Arial";
    ctx.fillText(sc.change, sx + 14, y + 106);
    ctx.fillStyle = "#6B7280"; ctx.font = "17px Arial";
    ctx.fillText(sc.note, sx + 14, y + 132);
  });
}

export async function makeCard({ format = "x", asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice }) {
  const fmt = CARD_FORMATS.find(f => f.id === format) || CARD_FORMATS[0];
  const cv = document.createElement("canvas");
  cv.width = fmt.w; cv.height = fmt.h;
  const ctx = cv.getContext("2d");
  const args = { ctx, W: fmt.w, H: fmt.h, asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice };
  if (format === "square") await drawSquare(args);
  else if (format === "story") await drawStory(args);
  else await drawLandscape(args);
  return cv.toDataURL("image/png");
}

// ── X landscape — v1-preserved layout ────────────────────────────────────────
async function drawLandscape({ ctx, W, H, asset, sim, targetPct, months, freqLabel, userName, profileImg, analysis, livePrice }) {
  const G_dark = "#052E16";
  const totalInvested = sim.totalInvested;
  const LP = Math.round(W * 0.36);
  const RX = LP + 1, RW = W - LP, PAD = 38;

  ctx.fillStyle = "#F0FDF4"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#16A34A"; ctx.fillRect(0, 0, LP, H);
  ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.arc(LP * 0.1, H * 0.9, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.beginPath(); ctx.arc(LP * 0.9, -20, 180, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = "bold 24px Arial"; ctx.textAlign = "left";
  ctx.fillText("CMVNG", 24, 40);
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "13px Arial";
  ctx.fillText("DCA Simulator", 24, 58);

  const liveP = livePrice?.price || asset.current_price;
  const panelCX = LP / 2;

  if (profileImg) {
    const PFP_R = 80, PFP_Y = H * 0.30;
    const pimg = await loadImg(profileImg);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R + 10, 0, Math.PI * 2); ctx.fill();
    circleImage(ctx, pimg, panelCX, PFP_Y, PFP_R);
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#4ADE80"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R + 6, 0, Math.PI * 2); ctx.stroke();
    if (userName) {
      ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
      ctx.fillText(userName, panelCX, PFP_Y + PFP_R + 26);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "13px Arial";
      ctx.fillText("DCA Strategy", panelCX, PFP_Y + PFP_R + 44);
    }
    const TL_Y = H * 0.68, TL_R2 = 38;
    const logo = asset.image ? await loadImg(asset.image) : null;
    circleImage(ctx, logo, panelCX, TL_Y, TL_R2, "rgba(255,255,255,0.95)");
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(panelCX, TL_Y, TL_R2 + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 36px Arial"; ctx.textAlign = "center";
    ctx.fillText(asset.symbol.toUpperCase(), panelCX, TL_Y + 60);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "14px Arial";
    ctx.fillText(asset.name, panelCX, TL_Y + 80);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 22px Arial";
    ctx.fillText(fmtPrice(liveP), panelCX, TL_Y + 108);
  } else {
    const TL_Y = H * 0.38, TL_R = 70;
    const logo = asset.image ? await loadImg(asset.image) : null;
    circleImage(ctx, logo, panelCX, TL_Y, TL_R, "rgba(255,255,255,0.95)");
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(panelCX, TL_Y, TL_R + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 56px Arial"; ctx.textAlign = "center";
    ctx.fillText(asset.symbol.toUpperCase(), panelCX, TL_Y + TL_R + 58);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "17px Arial";
    ctx.fillText(asset.name, panelCX, TL_Y + TL_R + 82);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 26px Arial";
    ctx.fillText(fmtPrice(liveP), panelCX, TL_Y + TL_R + 118);
    if (userName) {
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 15px Arial";
      ctx.fillText(userName, panelCX, TL_Y + TL_R + 144);
    }
  }

  if (livePrice?.change24h !== undefined) {
    const chg = livePrice.change24h, up = chg >= 0;
    const chgTxt = `${fmtPct(chg)} today`;
    const tw = ctx.measureText(chgTxt).width + 22;
    const pillY = H - 100;
    rr(ctx, panelCX - tw / 2, pillY, tw, 28, 14);
    ctx.fillStyle = up ? "rgba(255,255,255,0.2)" : "rgba(220,38,38,0.5)"; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
    ctx.fillText(chgTxt, panelCX, pillY + 19);
  }

  const trendColor = analysis.trend === "Uptrend" ? "#4ADE80" : analysis.trend === "Downtrend" ? "#FCA5A5" : "#FDE68A";
  ctx.fillStyle = trendColor; ctx.font = "bold 15px Arial"; ctx.textAlign = "center";
  ctx.fillText(analysis.trend.toUpperCase(), panelCX, H - 64);
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "12px Arial";
  ctx.fillText(analysis.verdict, panelCX, H - 46);

  // right panel
  ctx.fillStyle = G_dark; ctx.font = "bold 15px Arial"; ctx.textAlign = "left";
  ctx.fillText("MY DCA PLAN", RX + PAD, 46);
  const planTxt = `${fmtUSD(sim.amtPer)} ${freqLabel.toLowerCase()} · ${months} month${months > 1 ? "s" : ""} · ${sim.entries} buys · ${fmtUSD(totalInvested)} total`;
  ctx.fillStyle = "#6B7280"; ctx.font = "14px Arial";
  ctx.fillText(planTxt, RX + PAD, 68);
  ctx.strokeStyle = "#E2F5E9"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX + PAD, 82); ctx.lineTo(W - PAD, 82); ctx.stroke();

  // Color ALWAYS by profit sign — never by market verdict.
  const profitColor = sim.targetProfit >= 0 ? "#16A34A" : "#DC2626";
  ctx.fillStyle = "#16A34A"; ctx.font = "bold 14px Arial";
  ctx.fillText(`IF ${asset.symbol.toUpperCase()} HITS +${targetPct}%  →  ${fmtPrice(sim.targetPrice)}`, RX + PAD, 110);
  ctx.fillStyle = G_dark; ctx.font = "bold 84px Arial";
  ctx.fillText(fmtUSD(sim.targetVal), RX + PAD, 202);
  ctx.fillStyle = profitColor; ctx.font = "bold 20px Arial";
  const profitTxt = `Profit: +${fmtUSD(sim.targetProfit)}`;
  ctx.fillText(profitTxt, RX + PAD, 234);
  const profW = ctx.measureText(profitTxt).width;
  const roiTxt = `+${sim.targetROI.toFixed(0)}% return`;
  const roiW = ctx.measureText(roiTxt).width + 24;
  rr(ctx, RX + PAD + profW + 14, 215, roiW, 26, 13);
  ctx.fillStyle = profitColor; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px Arial";
  ctx.fillText(roiTxt, RX + PAD + profW + 26, 233);

  ctx.strokeStyle = "#E2F5E9"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX + PAD, 252); ctx.lineTo(W - PAD, 252); ctx.stroke();
  ctx.fillStyle = "#9CA3AF"; ctx.font = "bold 11px Arial";
  ctx.fillText("OTHER SCENARIOS", RX + PAD, 272);

  // scenario columns (v1 sizing)
  const colW = (RW - PAD * 2) / 3;
  scenarioBoxes(sim).forEach((sc, i) => {
    const sx = RX + PAD + i * colW, sy = 282, sw = colW - 10, sh = 138;
    rr(ctx, sx, sy, sw, sh, 10); ctx.fillStyle = sc.bg; ctx.fill();
    ctx.strokeStyle = sc.brd; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = sc.c; ctx.font = "bold 11px Arial"; ctx.textAlign = "left";
    ctx.fillText(sc.label, sx + 12, sy + 22);
    ctx.fillStyle = G_dark; ctx.font = "bold 28px Arial";
    ctx.fillText(fmtUSD(sc.val), sx + 12, sy + 64);
    ctx.fillStyle = sc.c; ctx.font = "bold 15px Arial";
    ctx.fillText(sc.change, sx + 12, sy + 90);
    ctx.fillStyle = "#6B7280"; ctx.font = "13px Arial";
    ctx.fillText(sc.note, sx + 12, sy + 112);
  });

  const infoY = 438;
  rr(ctx, RX + PAD, infoY, RW - PAD * 2, 56, 8);
  ctx.fillStyle = "#F8FAFC"; ctx.fill(); ctx.strokeStyle = "#E2F5E9"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#9CA3AF"; ctx.font = "bold 11px Arial"; ctx.textAlign = "left";
  ctx.fillText("VALUE AT LIVE PRICE", RX + PAD + 14, infoY + 18);
  ctx.fillStyle = G_dark; ctx.font = "bold 21px Arial";
  ctx.fillText(fmtUSD(sim.currentVal), RX + PAD + 14, infoY + 44);
  const mid = RX + PAD + (RW - PAD * 2) / 2;
  ctx.strokeStyle = "#E2F5E9"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mid, infoY + 8); ctx.lineTo(mid, infoY + 48); ctx.stroke();
  ctx.fillStyle = "#9CA3AF"; ctx.font = "bold 11px Arial";
  ctx.fillText("AVG ENTRY PRICE", mid + 14, infoY + 18);
  ctx.fillStyle = G_dark; ctx.font = "bold 21px Arial";
  ctx.fillText(fmtPrice(sim.avgEntry), mid + 14, infoY + 44);

  ctx.fillStyle = "#CBD5E1"; ctx.font = "12px Arial"; ctx.textAlign = "left";
  ctx.fillText(`Not financial advice · DYOR · ${MODEL_LABEL}`, RX + PAD, H - 18);
  ctx.fillStyle = "#16A34A"; ctx.font = "bold 12px Arial"; ctx.textAlign = "right";
  ctx.fillText("cmvng.app", W - PAD, H - 18);
  ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.font = "11px Arial"; ctx.textAlign = "center";
  ctx.fillText("Not financial advice · DYOR", LP / 2, H - 18);
}

// ── Shared header for vertical formats ───────────────────────────────────────
async function drawVerticalHeader({ ctx, W, asset, userName, profileImg, livePrice, analysis }, bandH) {
  ctx.fillStyle = "#16A34A"; ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.arc(W * 0.08, bandH * 0.9, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.beginPath(); ctx.arc(W * 0.92, 0, 220, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = "bold 34px Arial"; ctx.textAlign = "left";
  ctx.fillText("CMVNG", 40, 62);
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "18px Arial";
  ctx.fillText("DCA Simulator", 40, 88);

  const cx = W / 2;
  const liveP = livePrice?.price || asset.current_price;
  let y = bandH * 0.36;
  if (profileImg) {
    const pimg = await loadImg(profileImg);
    circleImage(ctx, pimg, cx, y, 90);
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, y, 93, 0, Math.PI * 2); ctx.stroke();
    if (userName) {
      ctx.fillStyle = "#fff"; ctx.font = "bold 28px Arial"; ctx.textAlign = "center";
      ctx.fillText(userName, cx, y + 130);
    }
    y = bandH * 0.78;
    const logo = asset.image ? await loadImg(asset.image) : null;
    circleImage(ctx, logo, cx - 90, y, 40, "rgba(255,255,255,0.95)");
    ctx.fillStyle = "#fff"; ctx.font = "bold 42px Arial"; ctx.textAlign = "left";
    ctx.fillText(asset.symbol.toUpperCase(), cx - 34, y + 6);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 26px Arial";
    ctx.fillText(fmtPrice(liveP), cx - 34, y + 40);
  } else {
    const logo = asset.image ? await loadImg(asset.image) : null;
    circleImage(ctx, logo, cx, y, 85, "rgba(255,255,255,0.95)");
    ctx.fillStyle = "#fff"; ctx.font = "bold 52px Arial"; ctx.textAlign = "center";
    ctx.fillText(asset.symbol.toUpperCase(), cx, y + 150);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "24px Arial";
    ctx.fillText(asset.name, cx, y + 184);
    ctx.fillStyle = "#fff"; ctx.font = "bold 32px Arial";
    ctx.fillText(fmtPrice(liveP), cx, y + 228);
    if (userName) {
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 22px Arial";
      ctx.fillText(userName, cx, y + 262);
    }
  }
  const trendColor = analysis.trend === "Uptrend" ? "#4ADE80" : analysis.trend === "Downtrend" ? "#FCA5A5" : "#FDE68A";
  ctx.fillStyle = trendColor; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
  ctx.fillText(`${analysis.trend.toUpperCase()} · ${analysis.verdict}`, W / 2, bandH - 28);
}

async function drawSquare(args) {
  const { ctx, W, H, asset, sim, targetPct, months, freqLabel } = args;
  ctx.fillStyle = "#F0FDF4"; ctx.fillRect(0, 0, W, H);
  const bandH = Math.round(H * 0.42);
  await drawVerticalHeader(args, bandH);

  const PAD = 50;
  let y = bandH + 64;
  ctx.fillStyle = "#052E16"; ctx.font = "bold 22px Arial"; ctx.textAlign = "left";
  ctx.fillText("MY DCA PLAN", PAD, y);
  ctx.fillStyle = "#6B7280"; ctx.font = "20px Arial";
  ctx.fillText(`${fmtUSD(sim.amtPer)} ${freqLabel.toLowerCase()} · ${months} mo · ${sim.entries} buys · ${fmtUSD(sim.totalInvested)} total`, PAD, y + 32);

  y += 92;
  ctx.fillStyle = "#16A34A"; ctx.font = "bold 22px Arial";
  ctx.fillText(`IF ${asset.symbol.toUpperCase()} HITS +${targetPct}% → ${fmtPrice(sim.targetPrice)}`, PAD, y);
  ctx.fillStyle = "#052E16"; ctx.font = "bold 110px Arial";
  ctx.fillText(fmtUSD(sim.targetVal), PAD, y + 118);
  const profitColor = sim.targetProfit >= 0 ? "#16A34A" : "#DC2626";
  ctx.fillStyle = profitColor; ctx.font = "bold 30px Arial";
  ctx.fillText(`Profit: +${fmtUSD(sim.targetProfit)}  (+${sim.targetROI.toFixed(0)}%)`, PAD, y + 170);

  drawScenarioRow(ctx, sim, PAD, y + 210, W - PAD * 2, 150, "#052E16");

  ctx.fillStyle = "#CBD5E1"; ctx.font = "17px Arial"; ctx.textAlign = "left";
  ctx.fillText(`Not financial advice · DYOR · ${MODEL_LABEL}`, PAD, H - 28);
  ctx.fillStyle = "#16A34A"; ctx.font = "bold 18px Arial"; ctx.textAlign = "right";
  ctx.fillText("cmvng.app", W - PAD, H - 28);
}

async function drawStory(args) {
  const { ctx, W, H, asset, sim, targetPct, months, freqLabel } = args;
  ctx.fillStyle = "#F0FDF4"; ctx.fillRect(0, 0, W, H);
  const bandH = Math.round(H * 0.40);
  await drawVerticalHeader(args, bandH);

  const PAD = 60;
  let y = bandH + 90;
  ctx.fillStyle = "#052E16"; ctx.font = "bold 26px Arial"; ctx.textAlign = "left";
  ctx.fillText("MY DCA PLAN", PAD, y);
  ctx.fillStyle = "#6B7280"; ctx.font = "23px Arial";
  ctx.fillText(`${fmtUSD(sim.amtPer)} ${freqLabel.toLowerCase()} · ${months} mo · ${sim.entries} buys`, PAD, y + 38);
  ctx.fillText(`${fmtUSD(sim.totalInvested)} total invested`, PAD, y + 70);

  y += 150;
  ctx.fillStyle = "#16A34A"; ctx.font = "bold 26px Arial";
  ctx.fillText(`IF ${asset.symbol.toUpperCase()} HITS +${targetPct}%`, PAD, y);
  ctx.fillStyle = "#6B7280"; ctx.font = "22px Arial";
  ctx.fillText(`Target price ${fmtPrice(sim.targetPrice)}`, PAD, y + 34);
  ctx.fillStyle = "#052E16"; ctx.font = "bold 130px Arial";
  ctx.fillText(fmtUSD(sim.targetVal), PAD, y + 170);
  const profitColor = sim.targetProfit >= 0 ? "#16A34A" : "#DC2626";
  ctx.fillStyle = profitColor; ctx.font = "bold 36px Arial";
  ctx.fillText(`Profit: +${fmtUSD(sim.targetProfit)}  (+${sim.targetROI.toFixed(0)}%)`, PAD, y + 236);

  y += 320;
  // stacked scenarios for vertical space
  scenarioBoxes(sim).forEach((sc, i) => {
    const sy = y + i * 130, sh = 112;
    rr(ctx, PAD, sy, W - PAD * 2, sh, 14); ctx.fillStyle = sc.bg; ctx.fill();
    ctx.strokeStyle = sc.brd; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = sc.c; ctx.font = "bold 24px Arial"; ctx.textAlign = "left";
    ctx.fillText(`${sc.label}  (${sc.change})`, PAD + 26, sy + 44);
    ctx.fillStyle = "#052E16"; ctx.font = "bold 40px Arial";
    ctx.fillText(fmtUSD(sc.val), PAD + 26, sy + 90);
    ctx.fillStyle = "#6B7280"; ctx.font = "22px Arial"; ctx.textAlign = "right";
    ctx.fillText(sc.note, W - PAD - 26, sy + 90);
  });

  ctx.fillStyle = "#9CA3AF"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
  ctx.fillText("Build your own plan → cmvng.app", W / 2, H - 96);
  ctx.fillStyle = "#CBD5E1"; ctx.font = "19px Arial";
  ctx.fillText(`Not financial advice · DYOR · ${MODEL_LABEL}`, W / 2, H - 52);
}
