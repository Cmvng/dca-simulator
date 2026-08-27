// Data-quality gate (Phase 37): never silently simulate on invalid data.
// Takes raw CoinGecko-style [[timestampMs, price], ...] and returns a cleaned
// series plus a list of issues. `ok: false` means simulation must not run.

export const MIN_POINTS = 8;

export function validateHistory(prices) {
  const issues = [];
  if (!Array.isArray(prices) || prices.length === 0) {
    return { ok: false, issues: ["No price history returned."], cleaned: [] };
  }

  let cleaned = prices.filter(p =>
    Array.isArray(p) && p.length >= 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (cleaned.length < prices.length) issues.push(`${prices.length - cleaned.length} malformed data points removed.`);

  const nonPositive = cleaned.filter(p => p[1] <= 0).length;
  if (nonPositive) {
    issues.push(`${nonPositive} zero/negative prices removed.`);
    cleaned = cleaned.filter(p => p[1] > 0);
  }

  // Chronological order — sort if needed (flag it).
  for (let i = 1; i < cleaned.length; i++) {
    if (cleaned[i][0] < cleaned[i - 1][0]) {
      issues.push("Timestamps were out of order — series re-sorted.");
      cleaned = [...cleaned].sort((a, b) => a[0] - b[0]);
      break;
    }
  }

  // Duplicate timestamps — keep the last value for each.
  const dedup = [];
  for (const p of cleaned) {
    if (dedup.length && dedup[dedup.length - 1][0] === p[0]) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  if (dedup.length < cleaned.length) issues.push(`${cleaned.length - dedup.length} duplicate timestamps collapsed.`);
  cleaned = dedup;

  // Implausible single-step jumps (>20x either way) — flag, don't fix.
  let jumps = 0;
  for (let i = 1; i < cleaned.length; i++) {
    const r = cleaned[i][1] / cleaned[i - 1][1];
    if (r > 20 || r < 1 / 20) jumps++;
  }
  if (jumps) issues.push(`${jumps} implausible price jump(s) detected — treat results with caution.`);

  if (cleaned.length < MIN_POINTS) {
    return { ok: false, issues: [...issues, "Not enough valid price history to simulate."], cleaned };
  }
  return { ok: true, issues, cleaned };
}
