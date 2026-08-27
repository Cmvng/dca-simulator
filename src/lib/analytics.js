// Lightweight, privacy-respecting product analytics.
//
// No analytics backend currently exists in this project, so this module is a
// safe event layer: it forwards to window.plausible or window.gtag when the
// site owner adds one of those scripts, and is a silent no-op otherwise.
// Only high-level metadata is sent (coin id, frequency, months, target bucket)
// — never amounts typed by the user beyond an order-of-magnitude bucket,
// never names, photos, or anything wallet-related.

const bucketCapital = c =>
  c < 100 ? "<100" : c < 1000 ? "100-1k" : c < 10000 ? "1k-10k" : c < 100000 ? "10k-100k" : "100k+";

export function track(event, props = {}) {
  const safe = { ...props };
  if (typeof safe.capital === "number") { safe.capital_bucket = bucketCapital(safe.capital); delete safe.capital; }
  try {
    if (typeof window === "undefined") return;
    if (typeof window.plausible === "function") window.plausible(event, { props: safe });
    else if (typeof window.gtag === "function") window.gtag("event", event, safe);
    else if (import.meta.env?.DEV) console.debug("[analytics]", event, safe);
  } catch { /* analytics must never break the app */ }
}
