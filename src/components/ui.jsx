// Small shared UI primitives.
import React, { useState } from "react";
import { G, TONES } from "../styles/theme.js";
import { fmtPct } from "../lib/formatting/percentage.js";

export function Dot() {
  return (
    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: G.green, display: "inline-block", animation: "pulse 1.2s infinite" }} />
  );
}

export function Spinner() {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block", animation: `bop 0.7s ${i * 0.15}s infinite alternate` }} />
      ))}
    </span>
  );
}

export function TrendPill({ trend }) {
  const map = { Uptrend: TONES.good, Downtrend: TONES.bad, Ranging: TONES.warn };
  const [c, bg, b] = map[trend] || TONES.warn;
  return <span style={{ background: bg, color: c, border: `1px solid ${b}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{trend}</span>;
}

export function ToneBadge({ tone = "ok", children }) {
  const [c, bg, b] = TONES[tone] || TONES.ok;
  return <span style={{ background: bg, color: c, border: `1px solid ${b}`, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{children}</span>;
}

export function PctBadge({ val }) {
  const up = val >= 0;
  return (
    <span style={{ background: up ? G.greenPale : G.redPale, color: up ? G.green : G.red, border: `1px solid ${up ? G.greenBorder : G.redBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>
      {fmtPct(val)}
    </span>
  );
}

export function CoinImg({ src, symbol, size = 30 }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: G.greenPale, border: `1px solid ${G.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: size * 0.38, fontWeight: 800, color: G.green }}>
        {(symbol || "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} onError={() => setErr(true)} />;
}

// Accessible collapsible section (progressive disclosure).
export function Collapsible({ title, subtitle, defaultOpen = false, children, onOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${G.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
      <button
        onClick={() => { const next = !open; setOpen(next); if (next && onOpen) onOpen(); }}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px", background: G.surfaceAlt, border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span>
          <span style={{ fontSize: 13, fontWeight: 800, color: G.sub, display: "block" }}>{title}</span>
          {subtitle && <span style={{ fontSize: 12, color: G.muted }}>{subtitle}</span>}
        </span>
        <span aria-hidden="true" style={{ color: G.muted, fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {open && <div style={{ padding: "14px 16px", background: G.surface }}>{children}</div>}
    </div>
  );
}

export function InfoRow({ label, children, last = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${G.border}` }}>
      <span style={{ fontSize: 14, color: G.muted }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: G.text, textAlign: "right" }}>{children}</span>
    </div>
  );
}

// Honest staleness label for live data.
export function Staleness({ fetchedAt, stale, nowTick }) {
  if (!fetchedAt) return null;
  const s = Math.max(0, Math.round(((nowTick || Date.now()) - fetchedAt) / 60000));
  const label = s < 1 ? "just now" : `${s} min ago`;
  return (
    <span style={{ fontSize: 11, color: stale ? G.amber : G.muted }}>
      {stale ? "⚠ stale · " : ""}Updated {label}
    </span>
  );
}
