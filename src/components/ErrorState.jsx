import React from "react";
import { T, HAIRLINE, body, btnSecondary } from "../styles/theme.js";

// Human-readable error with retry. Never shows raw stack traces.
// Hairline top + bottom borders only — no colored fill.
export default function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div role="alert" style={{ background: T.paper, borderTop: HAIRLINE, borderBottom: HAIRLINE, padding: compact ? "10px 0" : "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ ...body, color: T.loss }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ ...btnSecondary, padding: "8px 14px", fontSize: 13 }}>
          Try again
        </button>
      )}
    </div>
  );
}
