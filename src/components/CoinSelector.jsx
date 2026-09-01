// Step 1 — coin discovery: quick picks, search (name/ticker), quick filters,
// selected-coin block with live price, staleness, analysis verdict and
// data-quality notes.

import React, { useMemo, useState } from "react";
import { T, SANS, CARD_SHADOW, inp, body, monoLabel, eyebrow, monoFigure, btnOption } from "../styles/theme.js";
import { CoinImg, TrendPill, Staleness, SignedPct } from "./ui.jsx";
import { InlineLoading } from "./LoadingState.jsx";
import { fmtPrice } from "../lib/formatting/money.js";
import { track } from "../lib/analytics.js";

const FILTERS = [
  { id: "all", label: "All 250", test: () => true },
  { id: "top10", label: "Top 10", test: c => c.market_cap_rank <= 10 },
  { id: "top50", label: "Top 50", test: c => c.market_cap_rank <= 50 },
  { id: "top100", label: "Top 100", test: c => c.market_cap_rank <= 100 },
  { id: "trending", label: "Trending (24h movers)", test: null }, // special: sorted by |24h|
  { id: "largecap", label: "Large cap", test: c => (c.market_cap || 0) >= 10e9 },
  { id: "highvol", label: "High volatility", test: c => Math.abs(c.price_change_percentage_24h || 0) >= 5 },
];

const QUICK_PICKS = ["btc", "eth", "sol", "xrp"];

// small pill chip — friendly, fully rounded
const chip = active => ({
  ...btnOption(active), padding: "7px 12px", fontSize: 12,
});

export default function CoinSelector({ coins, selected, onSelect, market }) {
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [activeIdx, setActiveIdx] = useState(-1);

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

  const visible = filtered.slice(0, 40);

  const quickCoins = useMemo(
    () => QUICK_PICKS.map(sym => coins.find(c => c.symbol.toLowerCase() === sym)).filter(Boolean),
    [coins]
  );

  const selectCoin = a => {
    onSelect(a);
    setSearch("");
    setDropOpen(false);
    setActiveIdx(-1);
    track("coin_selected", { coin: a.id, filter });
  };

  const onKeyDown = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!dropOpen) { setDropOpen(true); setActiveIdx(0); return; }
      setActiveIdx(i => e.key === "ArrowDown" ? Math.min(visible.length - 1, i + 1) : Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (dropOpen && activeIdx >= 0 && activeIdx < visible.length) {
        e.preventDefault();
        selectCoin(visible[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setDropOpen(false);
      setActiveIdx(-1);
    }
  };

  const { live, loadingLive, loadingHist, histError, analysis, history } = market;

  const historyDays = history?.prices?.length || 0;
  const limitedHistory = history && historyDays < 180;

  return (
    <div>
      {/* quick picks */}
      {!selected && quickCoins.length > 0 && (
        <div role="group" aria-label="Quick picks" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span style={monoLabel}>Quick picks</span>
          {quickCoins.map(c => (
            <button key={c.id} onClick={() => selectCoin(c)} style={chip(false)}>
              {c.symbol.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* quick filters */}
      <div role="group" aria-label="Quick filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setDropOpen(true); }}
            aria-pressed={filter === f.id}
            style={chip(filter === f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <label htmlFor="coin-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Search coins</label>
        <input
          id="coin-search"
          role="combobox" aria-expanded={dropOpen} aria-controls="coin-listbox" aria-autocomplete="list"
          aria-activedescendant={dropOpen && activeIdx >= 0 ? `coin-opt-${activeIdx}` : undefined}
          style={{ ...inp, paddingLeft: selected ? 48 : 14 }}
          value={selected ? `${selected.name} (${selected.symbol.toUpperCase()})` : search}
          onChange={e => { setSearch(e.target.value); if (selected) onSelect(null); setDropOpen(true); setActiveIdx(-1); }}
          onKeyDown={onKeyDown}
          onFocus={e => { e.target.style.borderColor = T.blue; setDropOpen(true); }}
          onBlur={e => { e.target.style.borderColor = T.line; setTimeout(() => setDropOpen(false), 180); }}
          placeholder="Search 250 coins…"
        />
        {selected && (
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <CoinImg src={selected.image} symbol={selected.symbol} size={24} />
          </div>
        )}

        {dropOpen && !selected && (
          <div id="coin-listbox" role="listbox" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 200, background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, boxShadow: CARD_SHADOW, maxHeight: 300, overflowY: "auto" }}>
            {visible.length === 0 && (
              <div style={{ ...body, padding: "16px 14px" }}>No coins match — try another name or ticker.</div>
            )}
            {visible.map((a, idx) => (
              <div key={a.id} id={`coin-opt-${idx}`} role="option" aria-selected={idx === activeIdx} tabIndex={-1}
                onMouseDown={() => selectCoin(a)}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", cursor: "pointer", background: idx === activeIdx ? T.card2 : "transparent" }}
              >
                <CoinImg src={a.image} symbol={a.symbol} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3 }}>{a.symbol.toUpperCase()} · #{a.market_cap_rank}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={monoFigure}>{fmtPrice(a.current_price)}</div>
                  <div style={{ fontSize: 12 }}><SignedPct val={a.price_change_percentage_24h || 0} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 14, background: T.card2, borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <CoinImg src={selected.image} symbol={selected.symbol} size={36} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: T.ink }}>
                {selected.name} <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3 }}>#{selected.market_cap_rank}</span>
              </div>
              {loadingLive && !live
                ? <InlineLoading label="Getting live price…" />
                : live
                  ? <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: SANS, fontSize: 21, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: T.ink }}>{fmtPrice(live.price)}</span>
                      <SignedPct val={live.change24h} />
                      <Staleness fetchedAt={live.fetchedAt} stale={live.stale} />
                    </div>
                  : <div style={monoFigure}>{fmtPrice(selected.current_price)}</div>
              }
            </div>
            {analysis && <TrendPill trend={analysis.trend} />}
          </div>

          {loadingHist && <InlineLoading label="Analysing price history…" />}
          {histError && <div role="alert" style={{ ...body, color: T.loss, marginTop: 8 }}>{histError}</div>}

          {/* data-quality notes — informative, not blocking */}
          {(limitedHistory || (analysis && analysis.volPct > 8) || history?.issues?.length > 0) && (
            <div style={{ marginTop: 10 }}>
              {limitedHistory && <Note>Limited history ({historyDays} days)</Note>}
              {analysis && analysis.volPct > 8 && <Note>High-volatility asset — expect large swings</Note>}
              {history?.issues?.length > 0 && <Note>Some price data was cleaned before use</Note>}
            </div>
          )}

          {analysis && (
            <div style={{ marginTop: 12, background: T.card, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ ...eyebrow, marginBottom: 5 }}>
                cmvng model score {analysis.score >= 0 ? "+" : ""}{analysis.score} (heuristic)
              </div>
              <div>
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: T.ink }}>{sentenceCase(analysis.verdict)}</span>
                <span style={body}> — {verdictDesc(analysis.score)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Note({ children }) {
  return <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, marginTop: 2 }}>Note: {children}</div>;
}

const sentenceCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const verdictDesc = s =>
  s >= 3 ? "Price action looks solid. Trend and momentum are on your side." :
  s >= 1 ? "Conditions are okay. DCA helps reduce your timing risk here." :
  s >= -1 ? "Market is uncertain. Keep position sizes smaller than usual." :
  "Price action is poor. Expect a tough road before profit.";
