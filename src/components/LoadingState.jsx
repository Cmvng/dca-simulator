import React from "react";
import { G } from "../styles/theme.js";

// Progress-bar loading line.
export function ProgressLoading({ label, progress }) {
  return (
    <div role="status" aria-live="polite">
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ height: 4, background: G.border, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", background: G.green, borderRadius: 4, width: `${progress}%`, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// Skeleton block for cards that are still loading.
export function Skeleton({ height = 60, style = {} }) {
  return (
    <div aria-hidden="true" style={{ height, borderRadius: 10, background: `linear-gradient(90deg, ${G.surfaceAlt}, ${G.border}, ${G.surfaceAlt})`, backgroundSize: "200% 100%", animation: "pulse 1.4s ease infinite", ...style }} />
  );
}

export function InlineLoading({ label }) {
  return <div role="status" aria-live="polite" style={{ fontSize: 12, color: G.muted }}>{label}</div>;
}
