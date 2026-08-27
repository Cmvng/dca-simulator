import React from "react";
import { G } from "../styles/theme.js";

// Human-readable error with retry. Never shows raw stack traces.
export default function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div role="alert" style={{ background: G.redPale, border: `1px solid ${G.redBorder}`, borderRadius: 12, padding: compact ? "10px 14px" : "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, color: G.red, fontWeight: 600 }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ background: "#fff", color: G.red, border: `1.5px solid ${G.redBorder}`, borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Try again
        </button>
      )}
    </div>
  );
}
