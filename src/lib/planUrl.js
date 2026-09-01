// Shareable plan URLs without a server: the plan config is encoded in the URL
// hash (#p=...). Contains ONLY the plan parameters — never names, photos, or
// anything personal. A recipient's browser rebuilds the simulation locally.
// The app prefers revocable /plan/<id> short links when its plan API is
// available and uses this fragment form as the infrastructure-free fallback.

import { MIN_CAPITAL, MAX_CAPITAL } from "./simulation/dca.js";

const FIELDS = ["coinId", "capital", "freqId", "months", "targetPct", "feePct", "feeFixed", "slippagePct", "hybridPct", "mode"];

export function encodePlan(plan) {
  const slim = {};
  for (const f of FIELDS) if (plan[f] !== undefined && plan[f] !== null) slim[f] = plan[f];
  const json = JSON.stringify(slim);
  // base64url
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `#p=${b64}`;
}

export function decodePlanFromHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const m = /#p=([A-Za-z0-9_-]+)/.exec(hash || "");
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json);
    // Never trust URL input — validate every field.
    const out = {};
    if (typeof obj.coinId === "string" && /^[a-z0-9-]{1,64}$/.test(obj.coinId)) out.coinId = obj.coinId;
    const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) ? v : undefined;
    // engine bounds — a decoded plan below MIN_CAPITAL would fail to run
    out.capital = num(obj.capital, MIN_CAPITAL, MAX_CAPITAL);
    out.months = num(obj.months, 1, 6);
    out.targetPct = num(obj.targetPct, 1, 1000);
    out.feePct = num(obj.feePct, 0, 10);
    out.feeFixed = num(obj.feeFixed, 0, 1000);
    out.slippagePct = num(obj.slippagePct, 0, 5);
    out.hybridPct = num(obj.hybridPct, 0, 100);
    if (["12h", "daily", "weekly", "biweekly"].includes(obj.freqId)) out.freqId = obj.freqId;
    if (["scenario", "backtest"].includes(obj.mode)) out.mode = obj.mode;
    return out.coinId ? out : null;
  } catch {
    return null;
  }
}

export function planShareUrl(plan) {
  const base = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}`
    : "https://cmvng.app/";
  return `${base}${encodePlan(plan)}`;
}
