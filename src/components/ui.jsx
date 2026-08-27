// INSTRUMENT primitives — the reusable pieces every screen is built from.
// Hairlines, mono labels, tabular figures. Nothing ornamental.

import React, { useEffect, useRef, useState } from "react";
import { T, MONO, SANS, HAIRLINE_2, monoLabel, monoFigure, plColor } from "../styles/theme.js";

// mono whisper label — `outcome ruler`, `price path · 90d sample`
export function SectionLabel({ children, style = {} }) {
  return <div style={{ ...monoLabel, marginBottom: 12, ...style }}>{children}</div>;
}

// hairline-separated section (never a card)
export function Section({ label, ariaLabel, children, style = {} }) {
  return (
    <section aria-label={ariaLabel || undefined} style={{ borderTop: `0.5px solid ${T.line}`, padding: "18px 0", ...style }}>
      {label && <SectionLabel>{label}</SectionLabel>}
      {children}
    </section>
  );
}

// spec-sheet row: label-left / mono-figure-right
export function SpecRow({ label, children, last = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: last ? "none" : HAIRLINE_2 }}>
      <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 400, color: T.ink2 }}>{label}</span>
      <span style={{ ...monoFigure, textAlign: "right" }}>{children}</span>
    </div>
  );
}
// legacy alias — same contract
export const InfoRow = SpecRow;

// one-shot count-up for the hero numeral (≤400ms, ease-out); honors
// prefers-reduced-motion by rendering the final value immediately.
export function useCountUp(target, { duration = 400, enabled = true } = {}) {
  const [display, setDisplay] = useState(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return (!enabled || reduce) ? target : 0;
  });
  const done = useRef(false);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduce || done.current) { setDisplay(target); return; }
    done.current = true;
    const start = performance.now();
    let raf;
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return display;
}

// giant tabular ink numeral
export function Numeral({ children, size = 60, color = T.ink, style = {} }) {
  return (
    <div style={{
      fontFamily: SANS, fontSize: size, fontWeight: 500, letterSpacing: "-0.045em",
      lineHeight: 1, fontVariantNumeric: "tabular-nums", color, ...style,
    }}>
      {children}
    </div>
  );
}

// THE one permitted pill — Reality Check verdict only. Do not reuse.
export function Pill({ children }) {
  return (
    <span style={{ background: T.paper2, color: T.blueDeep, fontFamily: SANS, fontSize: 12, fontWeight: 500, borderRadius: 999, padding: "3px 10px" }}>
      {children}
    </span>
  );
}

// signed percentage / money figure — color by sign only (semantic P/L)
export function SignedPct({ val, digits = 1 }) {
  return (
    <span style={{ ...monoFigure, color: plColor(val) }}>
      {val >= 0 ? "+" : "−"}{Math.abs(val).toFixed(digits)}%
    </span>
  );
}
// legacy alias
export const PctBadge = SignedPct;

// trend as plain text (pills are banned)
export function TrendPill({ trend }) {
  const label = trend === "Uptrend" ? "uptrend" : trend === "Downtrend" ? "downtrend" : "sideways";
  return <span style={{ ...monoLabel, color: T.ink2 }}>{label}</span>;
}

// tone words as plain text — gain/loss coloring only where semantic
export function ToneBadge({ tone = "ok", children }) {
  const color = tone === "good" ? T.gain : tone === "bad" ? T.loss : tone === "warn" ? T.ink2 : T.blueDeep;
  return <span style={{ fontFamily: MONO, fontSize: 12, color, letterSpacing: "0.03em" }}>{String(children).toLowerCase()}</span>;
}

// static working indicator — motion may not loop
export function Spinner() {
  return <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 13 }}>…</span>;
}
export function Dot() {
  return <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: T.blue, display: "inline-block" }} />;
}

// coin identity image (data, not decoration) with letter fallback
export function CoinImg({ src, symbol, size = 28 }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: T.paper2, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: MONO, fontSize: size * 0.36, color: T.ink2 }}>
        {(symbol || "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} onError={() => setErr(true)} />;
}

// accessible collapsible — hairlines only
export function Collapsible({ title, subtitle, defaultOpen = false, children, onOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `0.5px solid ${T.line}` }}>
      <button
        onClick={() => { const next = !open; setOpen(next); if (next && onOpen) onOpen(); }}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "14px 0", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span>
          <span style={{ ...monoLabel, marginBottom: 0, display: "block" }}>{title}</span>
          {subtitle && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3 }}>{subtitle}</span>}
        </span>
        <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 13, color: T.ink3 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

// honest staleness caption — mono whisper
export function Staleness({ fetchedAt, stale }) {
  if (!fetchedAt) return null;
  const m = Math.max(0, Math.round((Date.now() - fetchedAt) / 60000));
  const label = m < 1 ? "just now" : `${m} min ago`;
  return (
    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: stale ? T.ink2 : T.ink3 }}>
      {stale ? "stale · " : ""}updated {label}
    </span>
  );
}
