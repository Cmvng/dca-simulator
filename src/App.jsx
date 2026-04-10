import { useState, useEffect, useRef, useCallback } from "react";

// ─── STABLECOINS TO EXCLUDE ──────────────────────────────────────────────────
const STABLECOINS = new Set([
  "tether","usd-coin","binance-usd","dai","true-usd","frax","usdp","neutrino",
  "gemini-dollar","liquity-usd","fei-usd","usdd","celo-dollar","terraclassicusd",
  "paxos-standard","nusd","flex-usd","usdk","husd","usdx","vai","susd","musd",
  "dola-usd","origin-dollar","usdn","sperax-usd","joe-yo","usdr","paypal-usd","first-digital-usd"
]);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CG = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 12 * 60 * 60 * 1000;
const PRICE_TTL = 60 * 1000; // 1 min for live price
const TARGETS = [10, 25, 50, 100, 200];

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#F0FBF4",
  surface: "#FFFFFF",
  surfaceAlt: "#F6FDF8",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  greenMid: "#4ADE80",
  greenDark: "#14532D",
  greenBorder: "#BBF7D0",
  text: "#14532D",
  textSub: "#166534",
  textMuted: "#6B7280",
  border: "#D1FAE5",
  red: "#DC2626",
  redLight: "#FEF2F2",
  amber: "#D97706",
  amberLight: "#FFFBEB",
  shadow: "0 1px 3px rgba(22,163,74,0.08), 0 4px 16px rgba(22,163,74,0.06)",
  shadowHover: "0 4px 20px rgba(22,163,74,0.15)",
};

// ─── CACHE ────────────────────────────────────────────────────────────────────
const cache = {
  get(k, ttl = CACHE_TTL) {
    try {
      const r = localStorage.getItem(k);
      if (!r) return null;
      const { d, t } = JSON.parse(r);
      return Date.now() - t < ttl ? d : null;
    } catch { return null; }
  },
  set(k, d) {
    try { localStorage.setItem(k, JSON.stringify({ d, t: Date.now() })); } catch {}
  },
  stale(k) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r).d : null; } catch { return null; }
  }
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function getTop50() {
  const hit = cache.get("top50");
  if (hit) return hit;
  const r = await fetch(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1`);
  if (!r.ok) { const s = cache.stale("top50"); if (s) return s; throw new Error("API error"); }
  const all = await r.json();
  const filtered = all.filter(a => !STABLECOINS.has(a.id)).slice(0, 50);
  cache.set("top50", filtered);
  return filtered;
}

async function getLivePrice(id) {
  const hit = cache.get(`lp_${id}`, PRICE_TTL);
  if (hit) return hit;
  const r = await fetch(`${CG}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d[id]) return null;
  const result = { price: d[id].usd, change24h: d[id].usd_24h_change };
  cache.set(`lp_${id}`, result);
  return result;
}

async function getHistory(id) {
  const hit = cache.get(`h_${id}`);
  if (hit) return hit;
  const r = await fetch(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=120`);
  if (!r.ok) { const s = cache.stale(`h_${id}`); if (s) return s; throw new Error("History fetch failed"); }
  const d = await r.json();
  cache.set(`h_${id}`, d);
  return d;
}

// ─── MATH ─────────────────────────────────────────────────────────────────────
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const std = a => { const m = avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

function analyzeMarket(prices) {
  const vals = prices.map(p => p[1]);
  const ma30 = avg(vals.slice(-30));
  const ma90 = avg(vals.slice(-90));
  const vol30 = std(vals.slice(-30));
  const cur = vals[vals.length - 1];
  const volPct = (vol30 / cur) * 100;
  let trend = "Ranging";
  if (cur > ma30 && ma30 > ma90) trend = "Uptrend";
  else if (cur < ma30 && ma30 < ma90) trend = "Downtrend";
  return { ma30, ma90, vol30, volPct, cur, trend };
}

function smooth(prices, w = 3) {
  return prices.map((p, i) => {
    const sl = prices.slice(Math.max(0, i - w + 1), i + 1).map(x => x[1]);
    return avg(sl);
  });
}

function runSim({ capital, frequency, months, targetPct, prices, livePrice }) {
  const freqDays = frequency === "12h" ? 0.5 : 1;
  const totalDays = months * 30;
  const entries = Math.min(120, Math.max(10, Math.round(totalDays / freqDays)));
  const amtPer = capital / entries;
  const sm = smooth(prices);
  const step = Math.max(1, Math.floor(sm.length / entries));
  const entryPrices = Array.from({ length: entries }, (_, i) => sm[Math.min(i * step, sm.length - 1)]);
  const totalTokens = entryPrices.reduce((s, p) => s + amtPer / p, 0);
  const avgEntry = capital / totalTokens;
  const refPrice = livePrice || prices[prices.length - 1][1];
  const targetPrice = avgEntry * (1 + targetPct / 100);
  const targetVal = totalTokens * targetPrice;
  const currentVal = totalTokens * refPrice;
  const flatVal = totalTokens * avgEntry;
  const downVal = flatVal * 0.8;
  return {
    entries, amtPer, avgEntry, totalTokens,
    targetPrice, targetVal, targetProfit: targetVal - capital, targetROI: ((targetVal - capital) / capital) * 100,
    currentVal, currentROI: ((currentVal - capital) / capital) * 100,
    flatVal, downVal, downLoss: downVal - capital,
  };
}

// ─── FORMAT ───────────────────────────────────────────────────────────────────
const fmtUSD = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(2)}K` : `$${n.toFixed(2)}`;
const fmtPrice = n => n >= 1 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toPrecision(4)}`;
const fmtPct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// ─── SHARE CARD (Canvas) ──────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

async function makeCard({ asset, sim, targetPct, months, frequency, profileImg, analysis, livePrice }) {
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  // BG gradient - clean white to light green
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#F0FDF4");
  bg.addColorStop(1, "#DCFCE7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative circle top right
  ctx.fillStyle = "rgba(74,222,128,0.12)";
  ctx.beginPath(); ctx.arc(W + 80, -80, 300, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(22,163,74,0.07)";
  ctx.beginPath(); ctx.arc(W - 60, 200, 200, 0, Math.PI * 2); ctx.fill();

  // Decorative circle bottom left
  ctx.fillStyle = "rgba(74,222,128,0.1)";
  ctx.beginPath(); ctx.arc(-100, H + 100, 350, 0, Math.PI * 2); ctx.fill();

  // ── HEADER ──
  // Brand pill
  rr(ctx, 60, 60, 240, 52, 26);
  ctx.fillStyle = "#16A34A";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px 'Arial', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CMVNG", 180, 93);

  // Profile
  if (profileImg) {
    try {
      const img = await loadImg(profileImg);
      ctx.save();
      ctx.beginPath(); ctx.arc(W - 120, 86, 54, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, W - 174, 32, 108, 108);
      ctx.restore();
      ctx.strokeStyle = "#16A34A"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W - 120, 86, 54, 0, Math.PI * 2); ctx.stroke();
    } catch {}
  }

  // ── ASSET HEADER ──
  rr(ctx, 40, 150, W - 80, 180, 24);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#BBF7D0"; ctx.lineWidth = 2; ctx.stroke();

  // Asset logo
  if (asset.image) {
    try {
      const logo = await loadImg(asset.image);
      ctx.save();
      ctx.beginPath(); ctx.arc(130, 240, 50, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, 80, 190, 100, 100);
      ctx.restore();
    } catch {}
  }

  ctx.fillStyle = "#14532D";
  ctx.font = "bold 52px 'Arial', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(asset.symbol.toUpperCase(), 200, 248);

  ctx.fillStyle = "#6B7280";
  ctx.font = "28px 'Arial', sans-serif";
  ctx.fillText(asset.name, 200, 290);

  // Live price badge
  const priceColor = livePrice?.change24h >= 0 ? "#16A34A" : "#DC2626";
  const priceBg = livePrice?.change24h >= 0 ? "#DCFCE7" : "#FEF2F2";
  rr(ctx, 200, 300, 380, 16, 8);

  ctx.fillStyle = "#6B7280";
  ctx.font = "24px 'Arial', sans-serif";
  ctx.textAlign = "left";
  const priceStr = fmtPrice(livePrice?.price || asset.current_price);
  ctx.fillStyle = "#14532D";
  ctx.font = "bold 26px 'Arial', sans-serif";
  ctx.fillText(priceStr, 200, 316);
  if (livePrice?.change24h !== undefined) {
    ctx.fillStyle = priceColor;
    ctx.font = "22px 'Arial', sans-serif";
    ctx.fillText(` ${fmtPct(livePrice.change24h)} 24h`, 200 + ctx.measureText(priceStr).width + 10, 316);
  }

  // ── DCA STRATEGY CARD ──
  rr(ctx, 40, 355, W - 80, 200, 24);
  const stratGrad = ctx.createLinearGradient(40, 355, W - 40, 555);
  stratGrad.addColorStop(0, "#16A34A");
  stratGrad.addColorStop(1, "#15803D");
  ctx.fillStyle = stratGrad;
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.arc(W - 80, 420, 120, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "28px 'Arial', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MY DCA STRATEGY", 70, 405);

  ctx.font = "bold 54px 'Arial', sans-serif";
  ctx.fillText(`${fmtUSD(sim.amtPer)}`, 70, 470);
  ctx.font = "28px 'Arial', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(`every ${frequency === "12h" ? "12 hours" : "day"}  ·  ${months} month${months > 1 ? "s" : ""}  ·  ${sim.entries} entries`, 70, 515);

  // ── STATS ROW ──
  const stats = [
    ["AVG ENTRY", fmtPrice(sim.avgEntry)],
    ["TOTAL TOKENS", sim.totalTokens < 1 ? sim.totalTokens.toFixed(4) : sim.totalTokens.toFixed(2)],
    ["INVESTED", fmtUSD(sim.amtPer * sim.entries)],
  ];
  stats.forEach(([label, val], i) => {
    const x = 40 + i * ((W - 80) / 3);
    const w2 = (W - 80) / 3 - 12;
    rr(ctx, x, 575, w2, 120, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#BBF7D0"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#6B7280";
    ctx.font = "18px 'Arial', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w2 / 2, 610);
    ctx.fillStyle = "#14532D";
    ctx.font = "bold 28px 'Arial', sans-serif";
    ctx.fillText(val, x + w2 / 2, 655);
  });

  // ── TARGET RESULT ──
  rr(ctx, 40, 720, W - 80, 260, 24);
  ctx.fillStyle = "#F0FDF4";
  ctx.fill();
  ctx.strokeStyle = "#4ADE80"; ctx.lineWidth = 3; ctx.stroke();

  // Star / target icon
  ctx.fillStyle = "#16A34A";
  ctx.font = "36px 'Arial', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TARGET SCENARIO", 70, 775);

  ctx.fillStyle = "#6B7280";
  ctx.font = "26px 'Arial', sans-serif";
  ctx.fillText(`If ${asset.symbol.toUpperCase()} pumps +${targetPct}%  →  hits ${fmtPrice(sim.targetPrice)}`, 70, 815);

  ctx.fillStyle = "#16A34A";
  ctx.font = "bold 88px 'Arial', sans-serif";
  ctx.fillText(fmtUSD(sim.targetVal), 70, 910);

  ctx.fillStyle = "#14532D";
  ctx.font = "bold 36px 'Arial', sans-serif";
  ctx.fillText(`PROFIT: +${fmtUSD(sim.targetProfit)}`, 70, 955);

  // ROI badge
  rr(ctx, W - 260, 730, 200, 72, 36);
  ctx.fillStyle = "#16A34A";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 38px 'Arial', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`+${sim.targetROI.toFixed(0)}%`, W - 160, 777);

  // ── SCENARIOS ──
  const scenarios = [
    { label: "FLAT (0%)", val: sim.flatVal, roi: 0, color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    { label: "DOWN -20%", val: sim.downVal, roi: -20, color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  ];
  scenarios.forEach(({ label, val, roi, color, bg, border }, i) => {
    const x = 40 + i * ((W - 80) / 2 + 6);
    const sw = (W - 80) / 2 - 6;
    rr(ctx, x, 1000, sw, 140, 16);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 22px 'Arial', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + sw / 2, 1040);
    ctx.fillStyle = "#14532D";
    ctx.font = "bold 38px 'Arial', sans-serif";
    ctx.fillText(fmtUSD(val), x + sw / 2, 1090);
    ctx.fillStyle = color;
    ctx.font = "22px 'Arial', sans-serif";
    ctx.fillText(`${roi >= 0 ? "+" : ""}${roi}% ROI`, x + sw / 2, 1125);
  });

  // ── MARKET ANALYSIS ──
  rr(ctx, 40, 1165, W - 80, 180, 24);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#BBF7D0"; ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = "22px 'Arial', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MARKET ANALYSIS · 120 DAYS", 70, 1205);

  const trendColor = analysis.trend === "Uptrend" ? "#16A34A" : analysis.trend === "Downtrend" ? "#DC2626" : "#D97706";
  rr(ctx, 70, 1215, 200, 48, 24);
  ctx.fillStyle = trendColor + "22"; ctx.fill();
  ctx.strokeStyle = trendColor; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = trendColor;
  ctx.font = "bold 24px 'Arial', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(analysis.trend.toUpperCase(), 170, 1247);

  const mStats = [
    ["30D MA", fmtPrice(analysis.ma30)],
    ["90D MA", fmtPrice(analysis.ma90)],
    ["VOLATILITY", `${analysis.volPct.toFixed(1)}%`],
  ];
  mStats.forEach(([lbl, val], i) => {
    const x = 290 + i * 230;
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "20px 'Arial', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(lbl, x, 1247);
    ctx.fillStyle = "#14532D";
    ctx.font = "bold 26px 'Arial', sans-serif";
    ctx.fillText(val, x, 1285);
  });

  // ── REALITY CHECK ──
  const aggressive = targetPct > analysis.volPct * 2;
  rr(ctx, 40, 1365, W - 80, 120, 24);
  ctx.fillStyle = aggressive ? "#FEF2F2" : "#F0FDF4";
  ctx.fill();
  ctx.strokeStyle = aggressive ? "#FECACA" : "#4ADE80";
  ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = aggressive ? "#DC2626" : "#16A34A";
  ctx.font = "bold 26px 'Arial', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(aggressive ? "REALITY CHECK" : "WITHIN VOLATILITY RANGE", 70, 1410);
  ctx.font = "22px 'Arial', sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.fillText(
    aggressive
      ? "Target exceeds 2x recent market volatility. High risk move."
      : "Target aligns with historical volatility patterns.",
    70, 1450
  );

  // ── DISCLAIMER ──
  ctx.fillStyle = "#9CA3AF";
  ctx.font = "20px 'Arial', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Not financial advice. DYOR. Past performance ≠ future results.", W / 2, 1530);

  // ── FOOTER ──
  rr(ctx, 0, H - 160, W, 160, 0);
  const ftGrad = ctx.createLinearGradient(0, H - 160, 0, H);
  ftGrad.addColorStop(0, "#16A34A");
  ftGrad.addColorStop(1, "#14532D");
  ctx.fillStyle = ftGrad;
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 48px 'Arial', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CMVNG DCA SIMULATOR", W / 2, H - 95);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "26px 'Arial', sans-serif";
  ctx.fillText("cmvng.app  ·  #CMVNG  ·  #DCA  ·  #Crypto", W / 2, H - 50);

  return cv.toDataURL("image/png");
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const styles = {
  app: {
    minHeight: "100vh",
    background: C.bg,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: C.text,
    paddingBottom: 48,
  },
  header: {
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 64,
    position: "sticky",
    top: 0,
    zIndex: 50,
    boxShadow: "0 1px 8px rgba(22,163,74,0.08)",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 36,
    height: 36,
    background: C.green,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  logoText: {
    fontWeight: 800,
    fontSize: 18,
    color: C.green,
    letterSpacing: -0.5,
  },
  logoSub: {
    fontWeight: 400,
    fontSize: 12,
    color: C.textMuted,
    marginLeft: 2,
  },
  tagBadge: {
    background: C.greenLight,
    color: C.green,
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${C.greenBorder}`,
  },
  main: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "32px 16px",
  },
  hero: {
    textAlign: "center",
    marginBottom: 36,
  },
  heroTitle: {
    fontSize: "clamp(28px, 5vw, 42px)",
    fontWeight: 800,
    color: C.greenDark,
    margin: 0,
    lineHeight: 1.15,
  },
  heroSub: {
    fontSize: 16,
    color: C.textMuted,
    marginTop: 10,
    marginBottom: 0,
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: 24,
    boxShadow: C.shadow,
    marginBottom: 16,
    transition: "box-shadow 0.2s",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: C.green,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: `1.5px solid ${C.border}`,
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 16,
    fontFamily: "'Inter', sans-serif",
    color: C.text,
    background: C.surfaceAlt,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  pillBtn: (active) => ({
    flex: 1,
    padding: "11px 8px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 700,
    border: `2px solid ${active ? C.green : C.border}`,
    background: active ? C.green : C.surfaceAlt,
    color: active ? "#fff" : C.textMuted,
    transition: "all 0.18s",
  }),
  targetBtn: (active) => ({
    padding: "9px 0",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 700,
    border: `2px solid ${active ? C.green : C.border}`,
    background: active ? C.greenLight : C.surfaceAlt,
    color: active ? C.green : C.textMuted,
    flex: 1,
    transition: "all 0.18s",
  }),
  simulateBtn: (loading) => ({
    width: "100%",
    padding: "16px",
    borderRadius: 16,
    cursor: loading ? "not-allowed" : "pointer",
    fontFamily: "'Inter', sans-serif",
    fontSize: 17,
    fontWeight: 800,
    border: "none",
    background: loading ? "#9CA3AF" : `linear-gradient(135deg, ${C.green}, #15803D)`,
    color: "#fff",
    letterSpacing: 0.5,
    boxShadow: loading ? "none" : "0 4px 20px rgba(22,163,74,0.35)",
    transition: "all 0.2s",
  }),
  resultGreen: {
    background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
    border: `2px solid ${C.greenBorder}`,
    borderRadius: 20,
    padding: 28,
    marginBottom: 16,
  },
  bigNum: {
    fontSize: "clamp(36px, 6vw, 52px)",
    fontWeight: 900,
    color: C.green,
    lineHeight: 1,
    margin: "8px 0",
  },
  scenarioCard: (color, bg, border) => ({
    background: bg,
    border: `1.5px solid ${border}`,
    borderRadius: 16,
    padding: "18px 20px",
    flex: 1,
  }),
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: `1px solid ${C.border}`,
  },
};

function Spinner() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#fff",
          animation: `bounce 0.8s ${i * 0.15}s infinite alternate`,
        }} />
      ))}
      <style>{`@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-6px)}}`}</style>
    </div>
  );
}

function TrendPill({ trend }) {
  const map = { Uptrend: [C.green, C.greenLight, C.greenBorder], Downtrend: [C.red, C.redLight, "#FECACA"], Ranging: [C.amber, C.amberLight, "#FDE68A"] };
  const [color, bg, border] = map[trend] || map.Ranging;
  return <span style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{trend}</span>;
}

function LivePriceBadge({ price, change24h }) {
  const up = change24h >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: C.greenDark }}>{fmtPrice(price)}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: up ? C.green : C.red,
        background: up ? C.greenLight : C.redLight,
        padding: "2px 10px", borderRadius: 20,
        border: `1px solid ${up ? C.greenBorder : "#FECACA"}`,
      }}>
        {fmtPct(change24h)} 24h
      </span>
      <span style={{ fontSize: 11, color: C.textMuted }}>LIVE</span>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetErr, setAssetErr] = useState(null);

  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [history, setHistory] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loadingHist, setLoadingHist] = useState(false);

  const [capital, setCapital] = useState(500);
  const [frequency, setFrequency] = useState("daily");
  const [months, setMonths] = useState(3);
  const [targetPct, setTargetPct] = useState(50);
  const [profileImg, setProfileImg] = useState(null);

  const [simStep, setSimStep] = useState("idle"); // idle | running | done
  const [sim, setSim] = useState(null);
  const [cardUrl, setCardUrl] = useState(null);
  const [genCard, setGenCard] = useState(false);

  const maxMonths = frequency === "12h" ? 2 : 4;
  const dropRef = useRef(null);
  const livePriceTimer = useRef(null);

  useEffect(() => {
    getTop50().then(setAssets).catch(e => setAssetErr(e.message)).finally(() => setLoadingAssets(false));
  }, []);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [frequency]);

  // Live price polling
  const pollLivePrice = useCallback(async (id) => {
    if (!id) return;
    setLoadingLive(true);
    const lp = await getLivePrice(id);
    if (lp) setLivePrice(lp);
    setLoadingLive(false);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLivePrice(null);
    setHistory(null);
    setAnalysis(null);
    setSim(null);
    setSimStep("idle");
    setCardUrl(null);

    pollLivePrice(selected.id);
    livePriceTimer.current = setInterval(() => pollLivePrice(selected.id), 30000);

    setLoadingHist(true);
    getHistory(selected.id).then(d => {
      setHistory(d);
      setAnalysis(analyzeMarket(d.prices));
      setLoadingHist(false);
    }).catch(() => setLoadingHist(false));

    return () => clearInterval(livePriceTimer.current);
  }, [selected]);

  const handleSimulate = async () => {
    if (!history || !selected) return;
    setSimStep("running");
    setSim(null);
    setCardUrl(null);

    // Fetch fresh live price right now
    const lp = await getLivePrice(selected.id);
    if (lp) setLivePrice(lp);

    await new Promise(r => setTimeout(r, 900)); // UX delay for animation feel

    const result = runSim({
      capital: Number(capital) || 500,
      frequency,
      months: Math.min(months, maxMonths),
      targetPct,
      prices: history.prices,
      livePrice: lp?.price,
    });
    setSim(result);
    setSimStep("done");
  };

  const handleGenerateCard = async () => {
    if (!sim || !selected || !analysis) return;
    setGenCard(true);
    try {
      const url = await makeCard({ asset: selected, sim, targetPct, months: Math.min(months, maxMonths), frequency, profileImg, analysis, livePrice });
      setCardUrl(url);
    } catch (e) { console.error(e); }
    setGenCard(false);
  };

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.app}>
      {/* NAV */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>CM</div>
          <div>
            <span style={styles.logoText}>CMVNG</span>
            <span style={styles.logoSub}> DCA Simulator</span>
          </div>
        </div>
        <span style={styles.tagBadge}>Top 50 · Live Data</span>
      </header>

      <main style={styles.main}>
        {/* HERO */}
        <div style={styles.hero}>
          <h1 style={styles.heroTitle}>
            Simulate Your <span style={{ color: C.green }}>DCA Strategy</span>
          </h1>
          <p style={styles.heroSub}>
            Real-time data · Short-term DCA experiments · Viral share cards
          </p>
        </div>

        {/* STEP 1 — ASSET */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span style={{ background: C.green, color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>1</span>
            Pick Your Asset
          </div>

          {loadingAssets ? (
            <div style={{ color: C.textMuted, fontSize: 14 }}>Loading top 50 coins…</div>
          ) : assetErr ? (
            <div style={{ color: C.red, fontSize: 14 }}>{assetErr}</div>
          ) : (
            <div style={{ position: "relative" }} ref={dropRef}>
              <input
                style={{ ...styles.input, paddingLeft: selected ? 48 : 14 }}
                value={selected ? `${selected.name} (${selected.symbol.toUpperCase()})` : search}
                onChange={e => { setSearch(e.target.value); if (selected) setSelected(null); setDropOpen(true); }}
                onFocus={() => setDropOpen(true)}
                onBlur={() => setTimeout(() => setDropOpen(false), 180)}
                placeholder="Search BTC, ETH, SOL…"
              />
              {selected && (
                <img src={selected.image} alt="" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%" }} />
              )}
              {dropOpen && !selected && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200,
                  background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 16,
                  maxHeight: 260, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                }}>
                  {filtered.slice(0, 25).map((a, idx) => (
                    <div key={a.id} onMouseDown={() => { setSelected(a); setSearch(""); setDropOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                        cursor: "pointer", borderBottom: idx < 24 ? `1px solid ${C.border}` : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceAlt}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <img src={a.image} alt={a.symbol} style={{ width: 28, height: 28, borderRadius: "50%" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: C.textMuted }}>{a.symbol.toUpperCase()}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.greenDark }}>{fmtPrice(a.current_price)}</div>
                        <div style={{ fontSize: 11, color: a.price_change_percentage_24h >= 0 ? C.green : C.red }}>
                          {fmtPct(a.price_change_percentage_24h || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 16, padding: 16, background: C.surfaceAlt, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <img src={selected.image} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.text }}>{selected.name} <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 13 }}>#{selected.market_cap_rank}</span></div>
                  {loadingLive ? (
                    <div style={{ fontSize: 13, color: C.textMuted }}>Fetching live price…</div>
                  ) : livePrice ? (
                    <LivePriceBadge price={livePrice.price} change24h={livePrice.change24h} />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{fmtPrice(selected.current_price)}</div>
                  )}
                </div>
                {analysis && <TrendPill trend={analysis.trend} />}
              </div>
              {loadingHist && <div style={{ marginTop: 10, fontSize: 13, color: C.textMuted }}>Loading 120-day history…</div>}
            </div>
          )}
        </div>

        {/* STEP 2 — STRATEGY */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span style={{ background: C.green, color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>2</span>
            Set Your Strategy
          </div>

          {/* Capital */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 6 }}>Total Capital (USD)</label>
            <input
              type="number"
              style={styles.input}
              value={capital}
              min={50}
              onChange={e => setCapital(Math.max(1, Number(e.target.value)))}
              onFocus={e => e.target.style.borderColor = C.green}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          {/* Frequency */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 8 }}>Buy Frequency</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["12h", "daily"].map(f => (
                <button key={f} style={styles.pillBtn(frequency === f)} onClick={() => setFrequency(f)}>
                  {f === "12h" ? "Every 12 Hours" : "Once Daily"}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
              {frequency === "12h" ? "Max 2 months with 12h frequency" : "Max 4 months with daily frequency"}
            </div>
          </div>

          {/* Duration */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 8 }}>
              Duration: <span style={{ color: C.green }}>{Math.min(months, maxMonths)} month{months !== 1 ? "s" : ""}</span>
            </label>
            <input type="range" min={1} max={maxMonths} value={Math.min(months, maxMonths)}
              onChange={e => setMonths(Number(e.target.value))}
              style={{ width: "100%", accentColor: C.green, height: 4 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              <span>1 month</span><span>{maxMonths} months</span>
            </div>
          </div>

          {/* Target */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textSub, display: "block", marginBottom: 8 }}>Target Return</label>
            <div style={{ display: "flex", gap: 8 }}>
              {TARGETS.map(t => (
                <button key={t} style={styles.targetBtn(targetPct === t)} onClick={() => setTargetPct(t)}>+{t}%</button>
              ))}
            </div>
          </div>
        </div>

        {/* SIMULATE BTN */}
        {selected && history && (
          <button
            style={styles.simulateBtn(simStep === "running")}
            onClick={handleSimulate}
            disabled={simStep === "running"}
          >
            {simStep === "running" ? <Spinner /> : simStep === "done" ? "Recalculate ↻" : "Simulate My DCA →"}
          </button>
        )}

        {/* LOADING STATE */}
        {simStep === "running" && (
          <div style={{ ...styles.card, textAlign: "center", padding: "36px 24px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
            <div style={{ fontWeight: 700, color: C.green, fontSize: 18, marginBottom: 6 }}>Running simulation…</div>
            <div style={{ color: C.textMuted, fontSize: 14 }}>Fetching live price · Analysing 120-day history · Calculating outcomes</div>
          </div>
        )}

        {/* RESULTS */}
        {simStep === "done" && sim && selected && (
          <>
            {/* Target */}
            <div style={styles.resultGreen}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                🎯 Target Scenario — If {selected.symbol.toUpperCase()} pumps +{targetPct}%
              </div>
              <div style={styles.bigNum}>{fmtUSD(sim.targetVal)}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.green, marginBottom: 4 }}>
                +{fmtUSD(sim.targetProfit)} profit · +{sim.targetROI.toFixed(1)}% ROI
              </div>
              <div style={{ fontSize: 13, color: C.textMuted }}>
                Required price: {fmtPrice(sim.targetPrice)}
              </div>
            </div>

            {/* DCA Details */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>DCA Breakdown</div>
              {[
                ["Total Entries", sim.entries],
                ["Per Entry Amount", fmtUSD(sim.amtPer)],
                ["Avg Entry Price", fmtPrice(sim.avgEntry)],
                ["Total Tokens", sim.totalTokens < 1 ? sim.totalTokens.toFixed(6) : sim.totalTokens.toFixed(4)],
                ["Current Value (Live)", fmtUSD(sim.currentVal)],
                ["Unrealised P&L", <span style={{ color: sim.currentROI >= 0 ? C.green : C.red }}>{fmtPct(sim.currentROI)}</span>],
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ ...styles.statRow, borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 14, color: C.textMuted }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Scenarios */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={styles.scenarioCard(C.amber, C.amberLight, "#FDE68A")}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, letterSpacing: 1.5, marginBottom: 6 }}>FLAT — 0%</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.greenDark }}>{fmtUSD(sim.flatVal)}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>Breakeven</div>
              </div>
              <div style={styles.scenarioCard(C.red, C.redLight, "#FECACA")}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: 1.5, marginBottom: 6 }}>DOWN — 20%</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.greenDark }}>{fmtUSD(sim.downVal)}</div>
                <div style={{ fontSize: 12, color: C.red }}>{fmtUSD(sim.downLoss)} loss</div>
              </div>
            </div>

            {/* Market + Reality */}
            {analysis && (
              <div style={styles.card}>
                <div style={styles.cardTitle}>Market Analysis · 120 Days</div>
                {[
                  ["30-Day MA", fmtPrice(analysis.ma30)],
                  ["90-Day MA", fmtPrice(analysis.ma90)],
                  ["30-Day Volatility", `${analysis.volPct.toFixed(1)}%`],
                  ["Trend", <TrendPill trend={analysis.trend} />],
                ].map(([label, value], i, arr) => (
                  <div key={label} style={{ ...styles.statRow, borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ fontSize: 14, color: C.textMuted }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{value}</span>
                  </div>
                ))}
                {/* Reality check */}
                {(() => {
                  const agg = targetPct > analysis.volPct * 2;
                  return (
                    <div style={{ marginTop: 16, padding: "12px 16px", background: agg ? C.redLight : C.greenLight, borderRadius: 12, border: `1px solid ${agg ? "#FECACA" : C.greenBorder}` }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: agg ? C.red : C.green, marginBottom: 3 }}>
                        {agg ? "⚠️ Reality Check" : "✅ Within Range"}
                      </div>
                      <div style={{ fontSize: 13, color: C.textMuted }}>
                        {agg
                          ? "This target requires a bigger move than recent market behaviour. High-risk territory."
                          : "This target is consistent with recent volatility patterns."}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SHARE CARD */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>
                🔥 Generate Viral Share Card
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>
                Export a 1080×1920 card ready for X (Twitter), Instagram Stories & Reels.
              </div>

              <label style={{
                display: "block", padding: "10px 14px", background: C.surfaceAlt,
                border: `1.5px dashed ${C.greenBorder}`, borderRadius: 12,
                cursor: "pointer", color: C.textMuted, fontSize: 13, textAlign: "center", marginBottom: 14,
              }}>
                {profileImg ? "✅ Profile photo loaded — click to change" : "📷 Add your profile photo (optional)"}
                <input type="file" accept="image/*" onChange={e => {
                  const f = e.target.files[0]; if (!f) return;
                  const r = new FileReader(); r.onload = ev => setProfileImg(ev.target.result); r.readAsDataURL(f);
                }} style={{ display: "none" }} />
              </label>

              <button
                onClick={handleGenerateCard}
                disabled={genCard}
                style={{
                  width: "100%", padding: "14px", borderRadius: 14, cursor: genCard ? "not-allowed" : "pointer",
                  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 800, border: "none",
                  background: genCard ? "#9CA3AF" : C.green,
                  color: "#fff", marginBottom: 12,
                  boxShadow: genCard ? "none" : "0 4px 16px rgba(22,163,74,0.3)",
                }}
              >
                {genCard ? "Generating card…" : "⚡ Generate Share Card"}
              </button>

              {cardUrl && (
                <>
                  <img src={cardUrl} alt="Share card preview" style={{ width: "100%", borderRadius: 16, marginBottom: 12, border: `1px solid ${C.border}` }} />
                  <button
                    onClick={() => { const a = document.createElement("a"); a.href = cardUrl; a.download = `cmvng-dca-${selected.symbol}.png`; a.click(); }}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 14, cursor: "pointer",
                      fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 800, border: `2px solid ${C.green}`,
                      background: C.greenLight, color: C.green,
                    }}
                  >
                    ⬇ Download PNG for X / Instagram
                  </button>
                </>
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 24 }}>
          CMVNG DCA Simulator · Not financial advice · Data via CoinGecko
        </div>
      </main>
    </div>
  );
}
