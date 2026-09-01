// CLEAR BLUE primitives — soft floating cards, friendly pills, one vivid
// accent, big tabular numerals. See DESIGN.md.

import React, { useEffect, useRef, useState } from "react";
import { T, SANS, card, monoLabel, monoFigure, plColor, pillSoft, pillFilled } from "../styles/theme.js";
import { timeAgo } from "../lib/formatting/dates.js";
import mascotUrl from "../assets/mascot.svg";

// section label — 12px w600 muted; pass eyebrow for the UPPERCASE variant
export function SectionLabel({ children, eyebrow = false, style = {} }) {
  return (
    <div style={{
      ...monoLabel,
      ...(eyebrow ? { textTransform: "uppercase", letterSpacing: "0.06em" } : {}),
      marginBottom: 12, ...style,
    }}>
      {children}
    </div>
  );
}

// floating white card section
export function Section({ label, eyebrow = false, ariaLabel, children, style = {} }) {
  return (
    <section aria-label={ariaLabel || undefined} style={{ ...card, ...style }}>
      {label && <SectionLabel eyebrow={eyebrow}>{label}</SectionLabel>}
      {children}
    </section>
  );
}

// stat row: label-left / bold-tabular-value-right
export function SpecRow({ label, children, last = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${T.line}` }}>
      <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 400, color: T.ink2 }}>{label}</span>
      <span style={{ ...monoFigure, textAlign: "right" }}>{children}</span>
    </div>
  );
}
export const InfoRow = SpecRow;

// one-shot count-up for the hero numeral (≤600ms ease-out); honors
// prefers-reduced-motion by rendering the final value immediately.
export function useCountUp(target, { duration = 600, enabled = true } = {}) {
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

// giant tabular numeral — the loudest thing on any screen
export function Numeral({ children, size = 58, color = T.ink, style = {} }) {
  return (
    <div style={{
      fontFamily: SANS, fontSize: size, fontWeight: 700, letterSpacing: "-0.02em",
      lineHeight: 1.05, fontVariantNumeric: "tabular-nums", color, ...style,
    }}>
      {children}
    </div>
  );
}

// rounded delta badge under the hero numeral: "↑ +$5,000 · +50%"
export function DeltaBadge({ profit, roiPct, suffix }) {
  const up = profit >= 0;
  return (
    <span style={{ ...pillSoft, fontSize: 13, padding: "7px 14px", fontVariantNumeric: "tabular-nums" }}>
      <span aria-hidden="true">{up ? "↑" : "↓"}</span>
      <span>{up ? "+" : "−"}{fmtAbsUSD(profit)} · {roiPct >= 0 ? "+" : "−"}{Math.abs(roiPct).toFixed(0)}%{suffix ? ` · ${suffix}` : ""}</span>
    </span>
  );
}
function fmtAbsUSD(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${a.toFixed(2)}`;
}

// pills — filled (blue) and soft (tint); pills are welcome in CLEAR BLUE
export function Pill({ children, variant = "soft", style = {} }) {
  return <span style={{ ...(variant === "filled" ? pillFilled : pillSoft), ...style }}>{children}</span>;
}

// signed percentage — color by sign only (semantic P/L)
export function SignedPct({ val, digits = 1 }) {
  return (
    <span style={{ ...monoFigure, color: plColor(val) }}>
      {val >= 0 ? "+" : "−"}{Math.abs(val).toFixed(digits)}%
    </span>
  );
}
export const PctBadge = SignedPct;

// trend as a soft neutral pill
export function TrendPill({ trend }) {
  const label = trend === "Uptrend" ? "Uptrend" : trend === "Downtrend" ? "Downtrend" : "Sideways";
  return <span style={{ ...pillSoft, background: T.card2, color: T.ink2 }}>{label}</span>;
}

// tone words as soft pills — gain/loss color only where semantic
export function ToneBadge({ tone = "ok", children }) {
  const color = tone === "good" ? T.gain : tone === "bad" ? T.loss : tone === "warn" ? T.ink2 : T.blue;
  const bg = tone === "good" ? "rgba(18,183,106,0.12)" : tone === "bad" ? "rgba(240,68,46,0.10)" : tone === "warn" ? T.card2 : T.blueSoft;
  return <span style={{ ...pillSoft, background: bg, color }}>{children}</span>;
}

// static working indicator — motion may not loop
export function Spinner() {
  return <span aria-hidden="true" style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>…</span>;
}
export function Dot() {
  return <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue, display: "inline-block" }} />;
}

// coin identity image with letter fallback
export function CoinImg({ src, symbol, size = 30 }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: T.card2, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: SANS, fontWeight: 700, fontSize: size * 0.34, color: T.ink2 }}>
        {(symbol || "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} onError={() => setErr(true)} />;
}

// accessible collapsible — soft inset header, lives inside cards
export function Collapsible({ title, subtitle, defaultOpen = false, children, onOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...card, padding: 8, marginBottom: 14 }}>
      <button
        onClick={() => { const next = !open; setOpen(next); if (next && onOpen) onOpen(); }}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: T.card2, border: "none", borderRadius: 14, cursor: "pointer", textAlign: "left" }}
      >
        <span>
          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: T.ink, display: "block" }}>{title}</span>
          {subtitle && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink3 }}>{subtitle}</span>}
        </span>
        <span aria-hidden="true" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.ink3, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      {open && <div style={{ padding: "14px 14px 8px" }}>{children}</div>}
    </div>
  );
}

// honest staleness caption
export function Staleness({ fetchedAt, stale }) {
  if (!fetchedAt) return null;
  return (
    <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: stale ? T.ink2 : T.ink3 }}>
      {stale ? "stale · " : ""}Updated {timeAgo(fetchedAt)}
    </span>
  );
}

// the blue offset-bars logo mark (inline; official file can replace it — see src/assets/README.md)
export function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <rect x="3" y="8" width="4.6" height="13" rx="2.3" fill={T.bluePress} />
      <rect x="9.7" y="3" width="4.6" height="18" rx="2.3" fill={T.blue} />
      <rect x="16.4" y="11" width="4.6" height="10" rx="2.3" fill={T.blue} opacity="0.55" />
    </svg>
  );
}

// the green character — brand accent ONLY (empty/loading states, avatars,
// intro moments). NEVER a background, never behind text or data.
export function Mascot({ size = 72, style = {} }) {
  return <img src={mascotUrl} alt="" width={size} height={size} style={{ display: "block", ...style }} />;
}
export { mascotUrl };
