// INSTRUMENT design tokens — see DESIGN.md. This file is design law:
// the entire palette lives here. If a color you want is missing, the design
// is wrong — do not add a hue.

export const T = {
  ink: "#0A1526",      // primary text, hero numerals, the black action bar
  ink2: "#5C6E8A",     // secondary text, row labels
  ink3: "#8A94A6",     // tertiary, captions, staleness
  paper: "#FCFDFE",    // page + surface background
  paper2: "#EFF5FC",   // faint fill under chart area only (+ the one pill bg)
  line: "#E2E8F1",     // default hairline border
  line2: "#EFF3F8",    // faint inner divider between table rows
  blue: "#185FA5",     // single accent
  blueDeep: "#0C447C", // target numeral, chart price line
  blueSoft: "#85B7EB", // avg-entry dashed rule, minor ticks
  gain: "#0E7A4F",     // gain figures only — never decoration
  loss: "#B3362B",     // loss figures only
  lossDeep: "#8A2A22", // the −50% severe marker
};

export const SANS = "'Inter','Segoe UI',system-ui,sans-serif";
export const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

export const HAIRLINE = `0.5px solid ${T.line}`;
export const HAIRLINE_2 = `0.5px solid ${T.line2}`;

// ── Shared style fragments ───────────────────────────────────────────────────

// mono whisper label: `price path · 90d sample`
export const monoLabel = {
  fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em",
  textTransform: "lowercase", color: T.ink3, fontWeight: 400,
};

// mono figure (right column of spec rows)
export const monoFigure = {
  fontFamily: MONO, fontSize: 13, color: T.ink,
  fontVariantNumeric: "tabular-nums", fontWeight: 400,
};

export const body = { fontFamily: SANS, fontSize: 13, fontWeight: 400, color: T.ink2, lineHeight: 1.6 };

// hairline-separated section (never a card)
export const section = { borderTop: HAIRLINE, padding: "18px 0", background: T.paper };

export const inp = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`,
  borderRadius: 2, padding: "11px 12px", fontSize: 16, fontFamily: SANS,
  fontWeight: 400, color: T.ink, background: T.paper, outline: "none",
};

// the single full-width flat black bar — one primary per screen
export const btnPrimary = {
  width: "100%", padding: "15px 16px", borderRadius: 0, cursor: "pointer",
  fontFamily: SANS, fontSize: 15, fontWeight: 500, border: "none",
  background: T.ink, color: "#FFFFFF", letterSpacing: "0.01em",
};

export const btnSecondary = {
  padding: "15px 16px", borderRadius: 0, cursor: "pointer",
  fontFamily: SANS, fontSize: 14, fontWeight: 400,
  border: `1px solid ${T.line}`, background: T.paper, color: T.ink,
};

// selectable option (frequency, target, presets): square, hairline, no fill
export const btnOption = active => ({
  padding: "10px 12px", borderRadius: 2, cursor: "pointer",
  fontFamily: SANS, fontSize: 13, fontWeight: active ? 500 : 400,
  border: `1px solid ${active ? T.ink : T.line}`,
  background: active ? T.paper2 : T.paper,
  color: active ? T.ink : T.ink2,
});

// P/L color by sign — semantic only
export const plColor = v => (v >= 0 ? T.gain : T.loss);

export const GLOBAL_CSS = `
  html,body{background:${T.paper}}
  button{font-family:inherit}
  :focus-visible{outline:1px solid ${T.ink};outline-offset:2px;border-radius:2px}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}
  }
`;

// ── Legacy compatibility bridge ──────────────────────────────────────────────
// Old components consume `G.<semantic>`. Mapped onto INSTRUMENT tokens so
// every not-yet-migrated file renders inside the new palette. Each stage
// removes its files' G usage; delete this bridge when nothing imports it.
export const G = {
  bg: T.paper, surface: T.paper, surfaceAlt: T.paper2,
  green: T.blue, green2: T.blueDeep, greenPale: T.paper2, greenBorder: T.line,
  dark: T.ink, text: T.ink, sub: T.ink2, muted: T.ink3, border: T.line,
  red: T.loss, redPale: T.paper, redBorder: T.line,
  amber: T.ink2, amberPale: T.paper2, amberBorder: T.line,
  blue: T.blue, bluePale: T.paper2,
  rose: T.lossDeep, rosePale: T.paper, roseBorder: T.line,
};
export const TONES = {
  good: [T.gain, T.paper, T.line],
  ok: [T.blueDeep, T.paper, T.line],
  warn: [T.ink2, T.paper, T.line],
  bad: [T.loss, T.paper, T.line],
};
export const card = { background: T.paper, borderTop: HAIRLINE, borderRadius: 0, padding: "18px 0", marginBottom: 0 };
export const secLabel = { ...monoLabel, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 };
export const stepNum = { ...monoLabel, color: T.ink2 };
export const btnGhost = { ...btnSecondary, padding: "10px 14px", fontSize: 13 };
