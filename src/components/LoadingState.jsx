import React from "react";
import { T, monoLabel } from "../styles/theme.js";

// Progress-bar loading line — mono whisper label over a 2px hairline track.
// The width transition is functional (progress), not decorative.
export function ProgressLoading({ label, progress }) {
  return (
    <div role="status" aria-live="polite">
      <div style={{ ...monoLabel, marginBottom: 8 }}>{label}</div>
      <div style={{ height: 2, background: T.line2 }}>
        <div style={{ height: "100%", background: T.ink, width: `${progress}%`, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// Static placeholder block for content that is still loading. No shimmer.
export function Skeleton({ height = 60, style = {} }) {
  return (
    <div aria-hidden="true" style={{ height, borderRadius: 2, background: T.paper2, ...style }} />
  );
}

export function InlineLoading({ label }) {
  return <div role="status" aria-live="polite" style={{ ...monoLabel }}>{label}</div>;
}
