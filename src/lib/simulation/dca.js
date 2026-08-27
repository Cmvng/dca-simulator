// Core DCA engine: scheduling, execution over a price path, lump-sum and
// hybrid comparisons, break-even math.
//
// SCHEDULING CONVENTION (documented in the Methodology panel):
//   - A "month" is 30 days.
//   - Purchase count = round((months × 30) / frequency-days), clamped to 4–180.
//     (This preserves the v1 methodology exactly.)
//   - Capital is split evenly across purchases.
//   - The first purchase happens on day 0 (today), purchase i on day i × frequency-days.

import { isFiniteNumber } from "./statistics.js";

export const FREQS = [
  { id: "12h",      label: "Every 12h", days: 0.5, maxMonths: 6 },
  { id: "daily",    label: "Daily",     days: 1,   maxMonths: 6 },
  { id: "weekly",   label: "Weekly",    days: 7,   maxMonths: 6 },
  { id: "biweekly", label: "Bi-weekly", days: 14,  maxMonths: 6 },
];

export const MIN_ENTRIES = 4;
export const MAX_ENTRIES = 180;
export const MIN_CAPITAL = 10;
export const MAX_CAPITAL = 1_000_000_000;

export function getFreq(freqId) {
  return FREQS.find(f => f.id === freqId) || FREQS[1];
}

// v1-preserved purchase-count rule.
export function entryCount(months, freqDays) {
  return Math.min(MAX_ENTRIES, Math.max(MIN_ENTRIES, Math.round((months * 30) / freqDays)));
}

export function validateCapital(capital) {
  if (!isFiniteNumber(capital)) return { ok: false, reason: "Enter a valid amount." };
  if (capital < MIN_CAPITAL) return { ok: false, reason: `Minimum is $${MIN_CAPITAL}.` };
  if (capital > MAX_CAPITAL) return { ok: false, reason: "That amount is beyond what this simulator supports." };
  return { ok: true };
}

// ── Integer-minor-unit money (MODEL v3.0.0, approved MCR-001) ────────────────
// All money quantities are computed in whole cents: capital is split to the
// cent (leftover cents go to the earliest purchases so the sum is EXACT),
// fees are rounded to the cent and clamped to the purchase amount. Asset
// units and prices remain continuous (fractional coins are inherently
// non-integer). Money outputs are cent-quantized at the engine boundary.

export const toCents = x => Math.round(x * 100);
export const round2 = v => Math.round(v * 100) / 100;

// Split totalCents across n purchases: floor share each, remainder cents
// distributed one-per-buy from the front. Σ result === totalCents exactly.
export function allocateCents(totalCents, n) {
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

// Plan skeleton — everything derivable without market data (instant preview).
export function buildSchedule({ capital, freqId, months }) {
  const freq = getFreq(freqId);
  const entries = entryCount(months, freq.days);
  const capitalCents = toCents(capital);
  return {
    freq,
    entries,
    capitalCents,
    amountsCents: allocateCents(capitalCents, entries),
    amtPer: capitalCents / entries / 100, // mean per-buy amount, for display
    windowDays: months * 30,
    // Day offset of each purchase from the start.
    dayOffsets: Array.from({ length: entries }, (_, i) => i * freq.days),
  };
}

// Execute a DCA plan against a series of entry prices.
// Prefer `amountsCents` (exact allocation); `amtPer` is a convenience
// fallback where each buy is round(amtPer × 100) cents.
export function executeDca({ amtPer, amountsCents, entryPrices, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const n = entryPrices.length;
  const cents = amountsCents ?? Array.from({ length: n }, () => Math.round(amtPer * 100));
  const feeFixedCents = Math.round(feeFixed * 100);
  const buys = [];
  let cumUnits = 0, cumInvestedCents = 0, cumFeeCents = 0;
  for (let i = 0; i < n; i++) {
    const price = entryPrices[i];
    const execPrice = price * (1 + slippagePct / 100);
    const grossCents = cents[i];
    const feeCents = Math.min(grossCents, Math.round(grossCents * (feePct / 100)) + feeFixedCents);
    const netCents = grossCents - feeCents;
    const units = execPrice > 0 ? (netCents / 100) / execPrice : 0;
    cumUnits += units;
    cumInvestedCents += grossCents;
    cumFeeCents += feeCents;
    buys.push({
      i, price, execPrice,
      gross: grossCents / 100, fee: feeCents / 100, net: netCents / 100, units,
      cumUnits, cumInvested: cumInvestedCents / 100, cumFees: cumFeeCents / 100,
      avgEntry: cumUnits > 0 ? (cumInvestedCents / 100) / cumUnits : 0,
    });
  }
  const units = cumUnits;
  return {
    buys,
    entries: n,
    amtPer: n > 0 ? cumInvestedCents / n / 100 : 0,
    totalInvested: cumInvestedCents / 100,
    totalFees: cumFeeCents / 100,
    netInvested: (cumInvestedCents - cumFeeCents) / 100,
    units,
    // Gross-basis average entry (v1 definition: capital / tokens).
    avgEntry: units > 0 ? (cumInvestedCents / 100) / units : 0,
  };
}

export function lumpSumOutcome({ capital, startPrice, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const r = executeDca({ amountsCents: [toCents(capital)], entryPrices: [startPrice], feePct, feeFixed, slippagePct });
  return { ...r, strategy: "lump" };
}

// initialPct% deployed at startPrice today, the rest DCA'd over entryPrices.
export function hybridOutcome({ capital, initialPct, startPrice, entryPrices, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const totalCents = toCents(capital);
  const upfrontCents = Math.round(totalCents * (initialPct / 100));
  const restCents = totalCents - upfrontCents;
  const lump = upfrontCents > 0
    ? executeDca({ amountsCents: [upfrontCents], entryPrices: [startPrice], feePct, feeFixed, slippagePct })
    : { units: 0, totalInvested: 0, totalFees: 0, buys: [] };
  const dca = restCents > 0
    ? executeDca({ amountsCents: allocateCents(restCents, entryPrices.length), entryPrices, feePct, feeFixed, slippagePct })
    : { units: 0, totalInvested: 0, totalFees: 0, buys: [] };
  const units = lump.units + dca.units;
  const totalInvested = lump.totalInvested + dca.totalInvested;
  return {
    strategy: "hybrid",
    initialPct,
    units,
    totalInvested,
    totalFees: lump.totalFees + dca.totalFees,
    avgEntry: units > 0 ? totalInvested / units : 0,
  };
}

export const valueAt = (units, price) => units * price;

export const roiPct = (value, invested) => invested > 0 ? ((value - invested) / invested) * 100 : 0;

// Price the asset must reach for a given ROI on the whole plan.
export function requiredPriceForRoi(totalInvested, units, targetRoiPct) {
  if (units <= 0) return NaN;
  return (totalInvested * (1 + targetRoiPct / 100)) / units;
}

export const breakEvenPrice = (totalInvested, units) => requiredPriceForRoi(totalInvested, units, 0);
