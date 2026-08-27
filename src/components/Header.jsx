import React from "react";
import { G } from "../styles/theme.js";
import { Dot } from "./ui.jsx";

export default function Header({ onOpenSaved, savedCount }) {
  return (
    <nav aria-label="Main" style={{ background: G.surface, borderBottom: `1px solid ${G.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 62, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(22,163,74,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div aria-hidden="true" style={{ width: 34, height: 34, background: G.green, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>CM</div>
        <span style={{ fontWeight: 800, fontSize: 17, color: G.green }}>CMVNG</span>
        <span style={{ fontWeight: 400, fontSize: 14, color: G.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>DCA Simulator</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {savedCount > 0 && (
          <button onClick={onOpenSaved} style={{ background: G.surfaceAlt, color: G.sub, border: `1px solid ${G.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            My plans ({savedCount})
          </button>
        )}
        <div style={{ background: G.greenPale, color: G.green, border: `1px solid ${G.greenBorder}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          <Dot />Live · Top 250
        </div>
      </div>
    </nav>
  );
}
