import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const TARGET_OPTIONS = [10, 25, 50, 100, 200];

const COLORS = {
  bg: "#0B0F14",
  card: "#121821",
  cardBorder: "#1E2A38",
  green: "#22C55E",
  red: "#EF4444",
  yellow: "#F59E0B",
  text: "#E2E8F0",
  muted: "#64748B",
  accent: "#3B82F6",
};

// ─── CACHE HELPERS ────────────────────────────────────────────────────────────
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function cacheFresh(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch { return null; }
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function fetchTop50() {
  const cached = cacheGet("top50");
  if (cached) return cached;
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1`
    );
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    cacheSet("top50", data);
    return data;
  } catch {
    const stale = cacheFresh("top50");
    if (stale) return stale;
    throw new Error("Failed to load assets. Check connection.");
  }
}

async function fetchHistory(id) {
  const key = `hist_${id}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=120`
    );
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    cacheSet(key, data);
    return data;
  } catch {
    const stale = cacheFresh(key);
    if (stale) return stale;
    throw new Error("Failed to load history. Using cached data if available.");
  }
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function analyzeMarket(prices) {
  const vals = prices.map((p) => p[1]);
  const ma30 = avg(vals.slice(-30));
  const ma90 = avg(vals.slice(-90));
  const vol30 = stddev(vals.slice(-30));
  const current = vals[vals.length - 1];

  let trend = "Range";
  if (current > ma30 && ma30 > ma90) trend = "Uptrend";
  else if (current < ma30 && ma30 < ma90) trend = "Downtrend";

  return { ma30, ma90, vol30, current, trend };
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function smoothedPrices(prices, window = 3) {
  return prices.map((p, i) => {
    const slice = prices.slice(Math.max(0, i - window + 1), i + 1).map((x) => x[1]);
    return avg(slice);
  });
}

// ─── SIMULATION ───────────────────────────────────────────────────────────────
function simulate({ capital, frequency, months, targetPct, prices }) {
  const freqDays = frequency === "12h" ? 0.5 : 1;
  const totalDays = months * 30;
  const entries = Math.min(120, Math.max(10, Math.round(totalDays / freqDays)));
  const amtPerEntry = capital / entries;

  const smooth = smoothedPrices(prices);
  const step = Math.max(1, Math.floor(smooth.length / entries));
  const entryPrices = Array.from({ length: entries }, (_, i) => {
    const idx = Math.min(i * step, smooth.length - 1);
    return smooth[idx];
  });

  const totalTokens = entryPrices.reduce((s, p) => s + amtPerEntry / p, 0);
  const avgEntryPrice = capital / totalTokens;

  const targetPrice = avgEntryPrice * (1 + targetPct / 100);
  const targetValue = totalTokens * targetPrice;
  const flatValue = totalTokens * avgEntryPrice;
  const downsideValue = totalTokens * avgEntryPrice * 0.8;

  return {
    entries,
    amtPerEntry,
    avgEntryPrice,
    totalTokens,
    targetPrice,
    targetValue,
    targetProfit: targetValue - capital,
    targetROI: ((targetValue - capital) / capital) * 100,
    flatValue,
    flatROI: 0,
    downsideValue,
    downsideROI: -20,
    downsideLoss: downsideValue - capital,
  };
}

// ─── SHARE CARD ───────────────────────────────────────────────────────────────
async function generateCard({ asset, sim, targetPct, months, frequency, profileImg, analysis }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");

  // BG
  ctx.fillStyle = "#0B0F14";
  ctx.fillRect(0, 0, 1200, 1500);

  // Subtle grid lines
  ctx.strokeStyle = "rgba(30,42,56,0.6)";
  ctx.lineWidth = 1;
  for (let y = 0; y < 1500; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke();
  }

  // Header card
  roundRect(ctx, 40, 40, 1120, 160, 16);
  ctx.fillStyle = "#121821";
  ctx.fill();
  ctx.strokeStyle = "#1E2A38";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Profile image
  if (profileImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 120, 55, 0, Math.PI * 2);
    ctx.clip();
    const img = await loadImage(profileImg);
    ctx.drawImage(img, 55, 65, 110, 110);
    ctx.restore();
  } else {
    ctx.fillStyle = "#1E2A38";
    ctx.beginPath(); ctx.arc(110, 120, 55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3B82F6";
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";
    ctx.fillText("DCA", 110, 130);
  }

  ctx.fillStyle = "#E2E8F0";
  ctx.font = "bold 36px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText("My DCA Strategy", 190, 110);
  ctx.fillStyle = "#64748B";
  ctx.font = "24px monospace";
  ctx.fillText("DCA Outcome Simulator", 190, 155);

  // Main Statement
  roundRect(ctx, 40, 220, 1120, 140, 16);
  ctx.fillStyle = "#0F1922";
  ctx.fill();
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#E2E8F0";
  ctx.font = "bold 42px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`I'm DCAing $${fmt(sim.amtPerEntry)} into ${asset.symbol.toUpperCase()}`, 600, 275);
  ctx.fillStyle = "#64748B";
  ctx.font = "28px monospace";
  ctx.fillText(`$${fmt(sim.amtPerEntry)} every ${frequency === "12h" ? "12 hours" : "day"} · ${months} month${months > 1 ? "s" : ""}`, 600, 335);

  // Details Row
  const details = [
    ["ENTRIES", sim.entries],
    ["AVG ENTRY", `$${fmtPrice(sim.avgEntryPrice)}`],
    ["TOTAL TOKENS", sim.totalTokens.toFixed(4)],
    ["TREND", analysis.trend],
  ];
  details.forEach(([label, val], i) => {
    const x = 80 + i * 265;
    roundRect(ctx, x, 380, 240, 110, 12);
    ctx.fillStyle = "#121821";
    ctx.fill();
    ctx.strokeStyle = "#1E2A38";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#64748B";
    ctx.font = "18px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + 120, 415);
    ctx.fillStyle = label === "TREND" ? (val === "Uptrend" ? "#22C55E" : val === "Downtrend" ? "#EF4444" : "#F59E0B") : "#E2E8F0";
    ctx.font = "bold 26px monospace";
    ctx.fillText(val, x + 120, 455);
  });

  // Target Result
  roundRect(ctx, 40, 510, 1120, 200, 16);
  ctx.fillStyle = "#071510";
  ctx.fill();
  ctx.strokeStyle = "#22C55E";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#22C55E";
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`🎯  If ${asset.symbol.toUpperCase()} hits +${targetPct}%`, 600, 560);
  ctx.fillStyle = "#E2E8F0";
  ctx.font = "bold 58px monospace";
  ctx.fillText(`$${fmt(sim.targetValue)}`, 600, 635);
  ctx.fillStyle = "#22C55E";
  ctx.font = "32px monospace";
  ctx.fillText(`+$${fmt(sim.targetProfit)} profit  ·  +${sim.targetROI.toFixed(0)}% ROI`, 600, 690);

  // Required price
  ctx.fillStyle = "#64748B";
  ctx.font = "22px monospace";
  ctx.fillText(`Required price: $${fmtPrice(sim.targetPrice)}`, 600, 725);

  // Scenarios
  const scenarios = [
    { label: "FLAT (0%)", value: sim.flatValue, change: 0, color: "#F59E0B" },
    { label: "DOWNSIDE (−20%)", value: sim.downsideValue, change: -20, color: "#EF4444" },
  ];
  scenarios.forEach(({ label, value, change, color }, i) => {
    const x = 40 + i * 570;
    roundRect(ctx, x, 740, 540, 130, 12);
    ctx.fillStyle = "#121821";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + 270, 780);
    ctx.fillStyle = "#E2E8F0";
    ctx.font = "bold 36px monospace";
    ctx.fillText(`$${fmt(value)}`, x + 270, 830);
    ctx.fillStyle = color;
    ctx.font = "22px monospace";
    ctx.fillText(`${change}% · $${fmt(value - (sim.amtPerEntry * sim.entries))} vs invested`, x + 270, 860);
  });

  // Reality check
  const totalCapital = sim.amtPerEntry * sim.entries;
  const isAgressive = targetPct > 2 * ((analysis.vol30 / analysis.current) * 100);
  roundRect(ctx, 40, 890, 1120, 120, 12);
  ctx.fillStyle = isAgressive ? "#1C0A0A" : "#071213";
  ctx.fill();
  ctx.strokeStyle = isAgressive ? "#EF4444" : "#22C55E";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = isAgressive ? "#EF4444" : "#22C55E";
  ctx.font = "bold 26px monospace";
  ctx.textAlign = "center";
  ctx.fillText(isAgressive ? "⚠  REALITY CHECK" : "✓  WITHIN RANGE", 600, 935);
  ctx.fillStyle = "#94A3B8";
  ctx.font = "22px monospace";
  const msg = isAgressive
    ? "This target requires a larger move than recent market behavior."
    : "This target aligns with recent volatility patterns.";
  ctx.fillText(msg, 600, 975);

  // Insight
  const insightText = `${asset.name} 30d avg: $${fmtPrice(analysis.ma30)} · 90d avg: $${fmtPrice(analysis.ma90)} · Vol: ${((analysis.vol30 / analysis.current) * 100).toFixed(1)}%`;
  roundRect(ctx, 40, 1030, 1120, 90, 12);
  ctx.fillStyle = "#0D1420";
  ctx.fill();
  ctx.strokeStyle = "#1E2A38";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#64748B";
  ctx.font = "22px monospace";
  ctx.textAlign = "center";
  ctx.fillText(insightText, 600, 1085);

  // Footer
  ctx.fillStyle = "#1E2A38";
  ctx.fillRect(0, 1440, 1200, 60);
  ctx.fillStyle = "#3B82F6";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("DCA OUTCOME SIMULATOR", 600, 1480);

  return canvas.toDataURL("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(2) + "K";
  return n.toFixed(2);
}

function fmtPrice(n) {
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toPrecision(4);
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Card({ children, style = {}, glow = false }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${glow ? COLORS.accent : COLORS.cardBorder}`,
      borderRadius: 14,
      padding: "20px",
      boxShadow: glow ? `0 0 20px rgba(59,130,246,0.15)` : "0 2px 12px rgba(0,0,0,0.3)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ color: COLORS.muted, fontSize: 11, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLORS.cardBorder}` }}>
      <span style={{ color: COLORS.muted, fontSize: 13, fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: color || COLORS.text, fontSize: 14, fontFamily: "monospace", fontWeight: "bold" }}>{value}</span>
    </div>
  );
}

function TrendBadge({ trend }) {
  const color = trend === "Uptrend" ? COLORS.green : trend === "Downtrend" ? COLORS.red : COLORS.yellow;
  return (
    <span style={{
      background: color + "20", color, border: `1px solid ${color}40`,
      borderRadius: 6, padding: "2px 10px", fontSize: 12, fontFamily: "monospace", fontWeight: "bold"
    }}>{trend}</span>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(null);

  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loadingHist, setLoadingHist] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const [capital, setCapital] = useState(1000);
  const [frequency, setFrequency] = useState("daily");
  const [months, setMonths] = useState(3);
  const [targetPct, setTargetPct] = useState(50);
  const [profileImg, setProfileImg] = useState(null);

  const [sim, setSim] = useState(null);
  const [cardUrl, setCardUrl] = useState(null);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const dropRef = useRef(null);

  // Constraint: 12h → max 2 months, daily → max 4 months
  const maxMonths = frequency === "12h" ? 2 : 4;
  const clampedMonths = Math.min(months, maxMonths);

  useEffect(() => {
    setLoadingAssets(true);
    fetchTop50()
      .then((data) => { setAssets(data); setLoadingAssets(false); })
      .catch((e) => { setAssetError(e.message); setLoadingAssets(false); });
  }, []);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [frequency]);

  useEffect(() => {
    if (!selectedAsset) return;
    setLoadingHist(true);
    setSim(null);
    setCardUrl(null);
    fetchHistory(selectedAsset.id)
      .then((data) => {
        setHistData(data);
        const a = analyzeMarket(data.prices);
        setAnalysis(a);
        setLoadingHist(false);
      })
      .catch(() => setLoadingHist(false));
  }, [selectedAsset]);

  useEffect(() => {
    if (!histData || !selectedAsset) return;
    setCardUrl(null);
    const result = simulate({
      capital: Number(capital) || 1000,
      frequency,
      months: clampedMonths,
      targetPct,
      prices: histData.prices,
    });
    setSim(result);
  }, [histData, capital, frequency, clampedMonths, targetPct]);

  const filteredAssets = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const handleProfileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setProfileImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!sim || !selectedAsset || !analysis) return;
    setGeneratingCard(true);
    try {
      const url = await generateCard({
        asset: selectedAsset,
        sim,
        targetPct,
        months: clampedMonths,
        frequency,
        profileImg,
        analysis,
      });
      setCardUrl(url);
    } catch (e) {
      console.error(e);
    }
    setGeneratingCard(false);
  };

  const handleDownload = () => {
    if (!cardUrl) return;
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = `dca-${selectedAsset?.symbol || "card"}.png`;
    a.click();
  };

  const isAggressive = analysis && sim
    ? targetPct > 2 * ((analysis.vol30 / analysis.current) * 100)
    : false;

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'Courier New', monospace",
      maxWidth: 480,
      margin: "0 auto",
      padding: "16px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: COLORS.accent, textTransform: "uppercase", marginBottom: 4 }}>
          Data-Backed
        </div>
        <div style={{ fontSize: 26, fontWeight: "bold", color: COLORS.text, letterSpacing: 1 }}>
          DCA Outcome Simulator
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
          Short-term crypto DCA · Real data · 1–6 months
        </div>
      </div>

      {/* Asset Selector */}
      <Card style={{ marginBottom: 14 }}>
        <Label>Select Asset (Top 50 by Market Cap)</Label>
        {loadingAssets ? (
          <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading assets…</div>
        ) : assetError ? (
          <div style={{ color: COLORS.red, fontSize: 13 }}>{assetError}</div>
        ) : (
          <div ref={dropRef} style={{ position: "relative" }}>
            <input
              value={selectedAsset ? `${selectedAsset.name} (${selectedAsset.symbol.toUpperCase()})` : search}
              onChange={(e) => { setSearch(e.target.value); setSelectedAsset(null); setDropOpen(true); }}
              onFocus={() => setDropOpen(true)}
              placeholder="Search BTC, ETH, SOL…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0D1520", border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8, padding: "10px 12px", color: COLORS.text,
                fontFamily: "monospace", fontSize: 14, outline: "none",
              }}
            />
            {dropOpen && !selectedAsset && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8, maxHeight: 220, overflowY: "auto", marginTop: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              }}>
                {filteredAssets.slice(0, 20).map((a) => (
                  <div
                    key={a.id}
                    onClick={() => { setSelectedAsset(a); setSearch(""); setDropOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: `1px solid ${COLORS.cardBorder}`,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#1E2A38"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <img src={a.image} alt={a.symbol} style={{ width: 22, height: 22, borderRadius: "50%" }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{a.name}</span>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>{a.symbol.toUpperCase()}</span>
                    <span style={{ color: COLORS.accent, fontSize: 12 }}>${fmtPrice(a.current_price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedAsset && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <img src={selectedAsset.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: "bold" }}>{selectedAsset.name}</div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>
                ${fmtPrice(selectedAsset.current_price)} · MCap #{selectedAsset.market_cap_rank}
              </div>
            </div>
            {analysis && <TrendBadge trend={analysis.trend} />}
            {loadingHist && <span style={{ color: COLORS.muted, fontSize: 12 }}>Loading…</span>}
          </div>
        )}
      </Card>

      {/* Inputs */}
      <Card style={{ marginBottom: 14 }}>
        <Label>Strategy Inputs</Label>

        <div style={{ marginBottom: 14 }}>
          <Label>Capital (USD)</Label>
          <input
            type="number"
            value={capital}
            min={100}
            onChange={(e) => setCapital(Math.max(1, Number(e.target.value)))}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0D1520", border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 8, padding: "10px 12px", color: COLORS.text,
              fontFamily: "monospace", fontSize: 16, outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Frequency</Label>
          <div style={{ display: "flex", gap: 8 }}>
            {["12h", "daily"].map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 13, fontWeight: "bold",
                  border: `1px solid ${frequency === f ? COLORS.accent : COLORS.cardBorder}`,
                  background: frequency === f ? COLORS.accent + "20" : "#0D1520",
                  color: frequency === f ? COLORS.accent : COLORS.muted,
                }}
              >
                {f === "12h" ? "Every 12h" : "Daily"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
            {frequency === "12h" ? "Max 2 months" : "Max 4 months"}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Duration: {clampedMonths} month{clampedMonths > 1 ? "s" : ""}</Label>
          <input
            type="range" min={1} max={maxMonths} value={clampedMonths}
            onChange={(e) => setMonths(Number(e.target.value))}
            style={{ width: "100%", accentColor: COLORS.accent }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.muted }}>
            <span>1 mo</span><span>{maxMonths} mo</span>
          </div>
        </div>

        <div>
          <Label>Target Return</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TARGET_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setTargetPct(t)}
                style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 13, fontWeight: "bold",
                  border: `1px solid ${targetPct === t ? COLORS.green : COLORS.cardBorder}`,
                  background: targetPct === t ? COLORS.green + "20" : "#0D1520",
                  color: targetPct === t ? COLORS.green : COLORS.muted,
                }}
              >
                +{t}%
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Results */}
      {sim && selectedAsset && (
        <>
          {/* DCA Details */}
          <Card style={{ marginBottom: 14 }}>
            <Label>DCA Details</Label>
            <StatRow label="Total Entries" value={sim.entries} />
            <StatRow label="Per Entry" value={`$${sim.amtPerEntry.toFixed(2)}`} />
            <StatRow label="Avg Entry Price" value={`$${fmtPrice(sim.avgEntryPrice)}`} />
            <StatRow label="Total Tokens" value={sim.totalTokens.toFixed(6)} />
          </Card>

          {/* Target */}
          <Card glow style={{ marginBottom: 14, border: `1px solid ${COLORS.green}40` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <Label>If {selectedAsset.symbol.toUpperCase()} hits +{targetPct}%</Label>
            </div>
            <div style={{ fontSize: 36, fontWeight: "bold", color: COLORS.green, marginBottom: 4 }}>
              ${fmt(sim.targetValue)}
            </div>
            <div style={{ fontSize: 14, color: COLORS.green, marginBottom: 8 }}>
              +${fmt(sim.targetProfit)} · +{sim.targetROI.toFixed(1)}% ROI
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              Required price: ${fmtPrice(sim.targetPrice)}
            </div>
          </Card>

          {/* Scenarios */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Card>
              <div style={{ fontSize: 11, color: COLORS.yellow, letterSpacing: 2, marginBottom: 6 }}>FLAT 0%</div>
              <div style={{ fontSize: 22, fontWeight: "bold", color: COLORS.text }}>${fmt(sim.flatValue)}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>Breakeven</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: COLORS.red, letterSpacing: 2, marginBottom: 6 }}>DOWN −20%</div>
              <div style={{ fontSize: 22, fontWeight: "bold", color: COLORS.text }}>${fmt(sim.downsideValue)}</div>
              <div style={{ fontSize: 11, color: COLORS.red }}>−${fmt(capital - sim.downsideValue)}</div>
            </Card>
          </div>

          {/* Reality Check */}
          <Card style={{ marginBottom: 14, border: `1px solid ${isAggressive ? COLORS.red + "50" : COLORS.green + "50"}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>{isAggressive ? "⚠️" : "✅"}</span>
              <div>
                <div style={{ fontSize: 12, color: isAggressive ? COLORS.red : COLORS.green, fontWeight: "bold", marginBottom: 4 }}>
                  {isAggressive ? "Reality Check" : "Within Range"}
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  {isAggressive
                    ? "This target requires a larger move than recent market behavior."
                    : "This target aligns with recent volatility patterns."}
                </div>
              </div>
            </div>
          </Card>

          {/* Market Insight */}
          {analysis && (
            <Card style={{ marginBottom: 14 }}>
              <Label>Market Insight (120d)</Label>
              <StatRow label="30d MA" value={`$${fmtPrice(analysis.ma30)}`} />
              <StatRow label="90d MA" value={`$${fmtPrice(analysis.ma90)}`} />
              <StatRow label="30d Volatility" value={`${((analysis.vol30 / analysis.current) * 100).toFixed(1)}%`} />
              <StatRow label="Trend" value={<TrendBadge trend={analysis.trend} />} />
            </Card>
          )}
        </>
      )}

      {/* Share Card */}
      {sim && selectedAsset && (
        <Card style={{ marginBottom: 24 }}>
          <Label>Share Card</Label>

          <div style={{ marginBottom: 12 }}>
            <Label>Profile Image (optional)</Label>
            <label style={{
              display: "block", padding: "8px 12px", background: "#0D1520",
              border: `1px dashed ${COLORS.cardBorder}`, borderRadius: 8,
              cursor: "pointer", color: COLORS.muted, fontSize: 12, textAlign: "center",
            }}>
              {profileImg ? "✅ Image loaded · Click to change" : "📷 Upload profile image"}
              <input type="file" accept="image/*" onChange={handleProfileUpload} style={{ display: "none" }} />
            </label>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generatingCard}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, cursor: "pointer",
              background: COLORS.accent, color: "#fff",
              fontFamily: "monospace", fontSize: 15, fontWeight: "bold",
              border: "none", marginBottom: 10, opacity: generatingCard ? 0.6 : 1,
            }}
          >
            {generatingCard ? "Generating…" : "⚡ Generate Share Card"}
          </button>

          {cardUrl && (
            <>
              <img src={cardUrl} alt="Share card" style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />
              <button
                onClick={handleDownload}
                style={{
                  width: "100%", padding: "12px", borderRadius: 10, cursor: "pointer",
                  background: COLORS.green, color: "#000",
                  fontFamily: "monospace", fontSize: 14, fontWeight: "bold", border: "none",
                }}
              >
                ⬇ Download PNG
              </button>
            </>
          )}
        </Card>
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: COLORS.muted, paddingBottom: 20 }}>
        DCA OUTCOME SIMULATOR · Not financial advice · Real data via CoinGecko
      </div>
    </div>
  );
}
