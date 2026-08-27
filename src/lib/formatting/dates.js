export const fmtDate = ts =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const fmtDateShort = ts =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// "Updated 2 min ago" — honest staleness labels for cached market data.
export function timeAgo(ts, now = Date.now()) {
  if (!ts) return null;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
