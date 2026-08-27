import React from "react";
import { T, SANS, MONO, monoLabel } from "../styles/theme.js";

export default function Header({ onOpenSaved, savedCount }) {
  return (
    <nav aria-label="Main" style={{ background: T.paper, borderBottom: `0.5px solid ${T.line}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 16, color: T.ink, letterSpacing: "-0.01em" }}>
          cmvng<span aria-hidden="true" style={{ color: T.blue }}>.</span>
        </span>
        <span style={{ ...monoLabel, marginBottom: 0 }}>dca simulator</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {savedCount > 0 && (
          <button onClick={onOpenSaved} style={{ background: "transparent", color: T.ink2, border: "none", padding: "4px 0", fontFamily: MONO, fontSize: 12, letterSpacing: "0.03em", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
            my plans ({savedCount})
          </button>
        )}
        <span style={{ ...monoLabel, marginBottom: 0, whiteSpace: "nowrap" }}>live · top 250</span>
      </div>
    </nav>
  );
}
