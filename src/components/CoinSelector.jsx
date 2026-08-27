// Step 1 — coin discovery: search (name/ticker), quick filters, selected-coin
// card with live price, staleness, analysis verdict and data-quality warnings.

import React, { useMemo, useState } from "react";
import { G, inp, TONES } from "../styles/theme.js";
import { CoinImg, TrendPill, Staleness } from "./ui.jsx";
import { InlineLoading } from "./LoadingState.jsx";
import { fmtPrice } from "../lib/formatting/money.js";
import { fmtPct } from "../lib/formatting/percentage.js";
import { track } from "../lib/analytics.js";

const FILTERS = [
  { id: "all", label: "All 250", test: () => true },
  { id: "top10", label: "Top 10", test: c => c.market_cap_rank <= 10 },
  { id: "top50", label: "Top 50", test: c => c.market_cap_rank <= 50 },
  { id: "top100", label: "Top 100", test: c => c.market_cap_rank <= 100 },
  { id: "trending", label: "Trending (24h movers)", test: null }, // special: sorted by |24h|
  { id: "largecap", label: "Large Cap", test: c => (c.market_cap || 0) >= 10e9 },
  { id: "highvol", label: "High Volatility", test: c => Math.abs(c.price_change_percentage_24h || 0) >= 5 },
];

export default function CoinSelector({ coins, selected, onSelect, market }) {
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    let list = coins;
    const f = FILTERS.find(x => x.id === filter);
    if (filter === "trending") {
      list = [...coins].sort((a, b) => Math.abs(b.price_change_percentage_24h || 0) - Math.abs(a.price_change_percentage_24h || 0)).slice(0, 25);
    } else if (f?.test) {
      list = coins.filter(f.test);
    }
    const q = search.toLowerCase();
    if (q) list = list.filter(a => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q));
    return list;
  }, [coins, search, filter]);

  const { live, loadingLive, loadingHist, histError, analysis, history } = market;

  const historyDays = history?.prices?.length || 0;
  const limitedHistory = history && historyDays < 180;

  return (
    <div>
      {/* quick filters */}
      <div role="group" aria-label="Quick filters" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setDropOpen(true); }}
            aria-pressed={filter === f.id}
            style={{
              padding: "5px 11px", borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${filter === f.id ? G.green : G.border}`,
              background: filter === f.id ? G.greenPale : G.surfaceAlt,
              color: filter === f.id ? G.green : G.muted,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <label htmlFor="coin-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Search coins</label>
        <input
          id="coin-search"
          role="combobox" aria-expanded={dropOpen} aria-controls="coin-listbox" aria-autocomplete="list"
          style={{ ...inp, paddingLeft: selected ? 48 : 14 }}
          value={selected ? `${selected.name} (${selected.symbol.toUpperCase()})` : search}
          onChange={e => { setSearch(e.target.value); if (selected) onSelect(null); setDropOpen(true); }}
          onFocus={e => { e.target.style.borderColor = G.green; setDropOpen(true); }}
          onBlur={e => { e.target.style.borderColor = G.border; setTimeout(() => setDropOpen(false), 180); }}
          placeholder="Search by name or ticker… (250 coins)"
        />
        {selected && (
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
            <CoinImg src={selected.image} symbol={selected.symbol} size={24} />
          </div>
        )}

        {dropOpen && !selected && (
          <div id="coin-listbox" role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200, background: G.surface, border: `1.5px solid ${G.border}`, borderRadius: 14, maxHeight: 300, overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.1)" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "16px 14px", fontSize: 13, color: G.muted }}>No coins match — try another name or ticker.</div>
            )}
            {filtered.slice(0, 40).map((a, idx) => (
              <div key={a.id} role="option" aria-selected="false" tabIndex={-1}
                onMouseDown={() => { onSelect(a); setSearch(""); setDropOpen(false); track("coin_selected", { coin: a.id, filter }); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: idx < Math.min(filtered.length, 40) - 1 ? `1px solid ${G.border}` : "none" }}
                onMouseEnter={e => e.currentTarget.style.background = G.surfaceAlt}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <CoinImg src={a.image} symbol={a.symbol} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: G.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: G.muted }}>{a.symbol.toUpperCase()} · #{a.market_cap_rank}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: G.dark }}>{fmtPrice(a.current_price)}</div>
                  <div style={{ fontSize: 11, color: (a.price_change_percentage_24h || 0) >= 0 ? G.green : G.red }}>{fmtPct(a.price_change_percentage_24h || 0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 14, padding: 14, background: G.surfaceAlt, borderRadius: 12, border: `1px solid ${G.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CoinImg src={selected.image} symbol={selected.symbol} size={36} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {selected.name} <span style={{ color: G.muted, fontWeight: 400, fontSize: 12 }}>#{selected.market_cap_rank}</span>
              </div>
              {loadingLive && !live
                ? <InlineLoading label="Getting live price…" />
                : live
                  ? <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 18, color: G.dark }}>{fmtPrice(live.price)}</span>
                      <span style={{ background: live.change24h >= 0 ? G.greenPale : G.redPale, color: live.change24h >= 0 ? G.green : G.red, border: `1px solid ${live.change24h >= 0 ? G.greenBorder : G.redBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>{fmtPct(live.change24h)}</span>
                      <Staleness fetchedAt={live.fetchedAt} stale={live.stale} />
                    </div>
                  : <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtPrice(selected.current_price)}</div>
              }
            </div>
            {analysis && <TrendPill trend={analysis.trend} />}
          </div>

          {loadingHist && <InlineLoading label="Analysing price history…" />}
          {histError && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: G.red }}>{histError}</div>}

          {/* data-quality notes — informative, not blocking */}
          {(limitedHistory || (analysis && analysis.volPct > 8) || history?.issues?.length > 0) && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {limitedHistory && <Warn tone="warn">Limited history ({historyDays} days)</Warn>}
              {analysis && analysis.volPct > 8 && <Warn tone="warn">High-volatility asset — expect large swings</Warn>}
              {history?.issues?.length > 0 && <Warn tone="warn">Some price data was cleaned before use</Warn>}
            </div>
          )}

          {analysis && (
            <div style={{ marginTop: 10, background: verdictBg(analysis.score), border: `1.5px solid ${verdictColor(analysis.score)}40`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>
                {analysis.score >= 3 ? "🔥" : analysis.score >= 1 ? "✅" : analysis.score >= -1 ? "⚠️" : "❌"}
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: verdictColor(analysis.score) }}>
                  {analysis.verdict} <span style={{ fontWeight: 600, color: G.muted, fontSize: 11 }}>· CMVNG Model Score {analysis.score >= 0 ? "+" : ""}{analysis.score} (heuristic)</span>
                </div>
                <div style={{ fontSize: 13, color: G.muted, marginTop: 2 }}>{verdictDesc(analysis.score)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Warn({ tone, children }) {
  const [c, bg, b] = TONES[tone];
  return <span style={{ background: bg, color: c, border: `1px solid ${b}`, borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

const verdictColor = s => s >= 3 ? G.green : s >= 1 ? G.blue : s >= -1 ? G.amber : G.red;
const verdictBg = s => s >= 3 ? G.greenPale : s >= 1 ? G.bluePale : s >= -1 ? G.amberPale : G.redPale;
const verdictDesc = s =>
  s >= 3 ? "Price action looks solid. Trend and momentum are on your side." :
  s >= 1 ? "Conditions are okay. DCA helps reduce your timing risk here." :
  s >= -1 ? "Market is uncertain. Keep position sizes smaller than usual." :
  "Price action is poor. Expect a tough road before profit.";
