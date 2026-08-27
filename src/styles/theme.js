// CLEAR BLUE design tokens — see DESIGN.md. This file is design law: the
// entire palette lives here. If a color you want is missing, the design is
// wrong — do not add a hue.
//
// Export names are kept stable across the re-theme so every consumer keeps
// compiling; their meanings are now CLEAR BLUE (the instrument look is
// retired — no monospace, no hairline-severity).

export const T = {
  // backgrounds & surfaces
  bg: "#EEF3FA",        // app backdrop — soft blue-grey, never pure white
  card: "#FFFFFF",      // cards float white on the bg
  card2: "#F4F8FD",     // inset fills, secondary panels, chart areas
  line: "#E4ECF6",      // soft hairline borders
  // text — near-navy, never pure black
  ink: "#0E1B33",
  ink2: "#5A6B87",
  ink3: "#93A2BC",
  // the single accent
  blue: "#2E6BF0",
  bluePress: "#2559D0",
  blueSoft: "#DBE7FE",
  blueRing: "rgba(46,107,240,0.16)",
  // semantic P/L only — never decorative
  gain: "#12B76A",
  loss: "#F0442E",
  // ── stable aliases used across existing components ──
  paper: "#FFFFFF",     // = card
  paper2: "#F4F8FD",    // = card2
  line2: "#E4ECF6",     // inner dividers share the soft line
  blueDeep: "#2559D0",  // = bluePress
  lossDeep: "#F0442E",  // no extra hue — severe shares the down red
  // amber: ONLY as a mid-scenario bar color between loss and target — nowhere else
  amberBar: "#F7A23B",
};

export const SANS = "'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif";
// monospace is retired in CLEAR BLUE — legacy MONO imports resolve to the app sans
export const MONO = SANS;

export const HAIRLINE = `1px solid ${T.line}`;
export const HAIRLINE_2 = `1px solid ${T.line}`;

export const CARD_SHADOW = "0 10px 30px -20px rgba(30,60,120,0.3)";

// ── Shared style fragments ───────────────────────────────────────────────────

// section label (may be used as an UPPERCASE eyebrow by adding textTransform)
export const monoLabel = {
  fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.ink3,
  letterSpacing: "0.01em",
};
export const eyebrow = {
  ...monoLabel, textTransform: "uppercase", letterSpacing: "0.06em",
};

// figure (right column of stat rows) — tabular, confident
export const monoFigure = {
  fontFamily: SANS, fontSize: 14, fontWeight: 600, color: T.ink,
  fontVariantNumeric: "tabular-nums",
};

export const body = { fontFamily: SANS, fontSize: 13.5, fontWeight: 400, color: T.ink2, lineHeight: 1.55 };

// floating white card — the surface everything sits on
export const card = {
  background: T.card, borderRadius: 22, border: "1px solid #FFFFFF",
  boxShadow: CARD_SHADOW, padding: "20px 20px", marginBottom: 14,
};
export const section = card;

export const inp = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`,
  borderRadius: 14, padding: "12px 14px", fontSize: 16, fontFamily: SANS,
  fontWeight: 500, color: T.ink, background: T.card, outline: "none",
};

// primary — the one vivid blue action per screen
export const btnPrimary = {
  width: "100%", padding: "15px 18px", borderRadius: 16, cursor: "pointer",
  fontFamily: SANS, fontSize: 15, fontWeight: 700, border: "none",
  background: T.blue, color: "#FFFFFF",
  boxShadow: `0 12px 26px -8px ${T.blue}`,
};

export const btnSecondary = {
  padding: "14px 18px", borderRadius: 16, cursor: "pointer",
  fontFamily: SANS, fontSize: 14, fontWeight: 600,
  border: `1px solid ${T.line}`, background: T.card, color: T.blue,
};

// selectable option chip (frequency, target, presets, filters)
export const btnOption = active => ({
  padding: "10px 14px", borderRadius: 100, cursor: "pointer",
  fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 500,
  border: `1px solid ${active ? T.blue : T.line}`,
  background: active ? T.blueSoft : T.card,
  color: active ? T.blue : T.ink2,
});

// pills
export const pillFilled = {
  display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 100,
  background: T.blue, color: "#FFFFFF", fontFamily: SANS, fontSize: 12,
  fontWeight: 700, padding: "5px 12px",
};
export const pillSoft = {
  display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 100,
  background: T.blueSoft, color: T.blue, fontFamily: SANS, fontSize: 12,
  fontWeight: 700, padding: "5px 12px",
};

// P/L color by sign — semantic only
export const plColor = v => (v >= 0 ? T.gain : T.loss);

export const GLOBAL_CSS = `
  html,body{background:${T.bg}}
  button{font-family:inherit}
  button:active{transform:translateY(2px)}
  :focus-visible{outline:3px solid ${T.blueRing};outline-offset:2px;border-radius:8px}
  @keyframes riseIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important;transform:none !important}
  }
`;
