import React from "react";
import { T, SANS, pillSoft } from "../styles/theme.js";
import { LogoMark } from "./ui.jsx";

export default function Header({ onOpenSaved, savedCount }) {
  return (
    <nav aria-label="Main" style={{ background: T.bg, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <LogoMark size={22} />
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: T.ink, letterSpacing: "-0.01em" }}>cmvng</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {savedCount > 0 && (
          <button onClick={onOpenSaved} style={{ ...pillSoft, border: "none", cursor: "pointer" }}>
            My plans ({savedCount})
          </button>
        )}
        <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.ink3, whiteSpace: "nowrap" }}>Live · Top 250</span>
      </div>
    </nav>
  );
}
