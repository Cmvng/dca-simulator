// CMVNG visual language — single source of truth for colors and shared styles.

export const G = {
  bg: "#F7FDF9", surface: "#FFFFFF", surfaceAlt: "#F0FBF4",
  green: "#16A34A", green2: "#15803D", greenPale: "#DCFCE7", greenBorder: "#BBF7D0",
  dark: "#052E16", text: "#1A2E1A", sub: "#166534", muted: "#6B7280", border: "#E2F5E9",
  red: "#DC2626", redPale: "#FEF2F2", redBorder: "#FECACA",
  amber: "#B45309", amberPale: "#FFFBEB", amberBorder: "#FDE68A",
  blue: "#1D4ED8", bluePale: "#EFF6FF",
  rose: "#9F1239", rosePale: "#FFF1F2", roseBorder: "#FDA4AF",
};

// tone → [color, background, border]
export const TONES = {
  good: [G.green, G.greenPale, G.greenBorder],
  ok: [G.blue, G.bluePale, "#BFDBFE"],
  warn: [G.amber, G.amberPale, G.amberBorder],
  bad: [G.red, G.redPale, G.redBorder],
};

export const inp = {
  width: "100%", boxSizing: "border-box", border: `1.5px solid ${G.border}`,
  borderRadius: 12, padding: "11px 14px", fontSize: 16, fontFamily: "inherit",
  color: G.text, background: G.surfaceAlt, outline: "none", transition: "border-color 0.15s",
};

export const card = {
  background: G.surface, border: `1px solid ${G.border}`, borderRadius: 18,
  padding: "22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(22,163,74,0.05)",
};

export const secLabel = {
  fontSize: 12, fontWeight: 800, color: G.green, letterSpacing: 2,
  textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 7,
};

export const stepNum = {
  width: 20, height: 20, borderRadius: "50%", background: G.green, color: "#fff",
  fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center",
  justifyContent: "center", flexShrink: 0,
};

export const statRow = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 0", borderBottom: `1px solid ${G.border}`,
};

export const btnPrimary = {
  width: "100%", padding: "14px", borderRadius: 12, cursor: "pointer",
  fontFamily: "inherit", fontSize: 15, fontWeight: 900, border: "none",
  background: G.green, color: "#fff", boxShadow: "0 4px 18px rgba(22,163,74,0.32)",
  transition: "all 0.2s",
};

export const btnGhost = {
  padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, fontWeight: 700, border: `1.5px solid ${G.border}`,
  background: G.surfaceAlt, color: G.sub,
};

// Global stylesheet: focus visibility, reduced motion, keyframes.
export const GLOBAL_CSS = `
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  @keyframes bop{from{transform:translateY(0)}to{transform:translateY(-5px)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  :focus-visible{outline:2px solid ${G.green};outline-offset:2px;border-radius:6px}
  button{font-family:inherit}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}
  }
`;
