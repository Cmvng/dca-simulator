import React from "react";
import { T, body, btnSecondary } from "../styles/theme.js";

// Human-readable error with retry. Never shows raw stack traces.
// A soft rounded card — friendly, not severe.
export default function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div role="alert" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: compact ? "10px 14px" : "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ ...body, color: T.loss }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ ...btnSecondary, padding: "9px 14px", fontSize: 13, borderRadius: 12 }}>
          Try again
        </button>
      )}
    </div>
  );
}
