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

// Plan skeleton — everything derivable without market data (instant preview).
export function buildSchedule({ capital, freqId, months }) {
  const freq = getFreq(freqId);
  const entries = entryCount(months, freq.days);
  return {
    freq,
    entries,
    amtPer: capital / entries,
    windowDays: months * 30,
    // Day offset of each purchase from the start.
    dayOffsets: Array.from({ length: entries }, (_, i) => i * freq.days),
  };
}

// Execute a DCA plan against a series of entry prices.
// Fees/slippage default to 0 so with defaults this reproduces v1 exactly:
//   units_i = amtPer / price_i ; avgEntry = capital / totalUnits.
export function executeDca({ amtPer, entryPrices, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const buys = [];
  let cumUnits = 0, cumInvested = 0, cumFees = 0;
  for (let i = 0; i < entryPrices.length; i++) {
    const price = entryPrices[i];
    const execPrice = price * (1 + slippagePct / 100);
    const fee = amtPer * (feePct / 100) + feeFixed;
    const net = Math.max(0, amtPer - fee);
    const units = execPrice > 0 ? net / execPrice : 0;
    cumUnits += units;
    cumInvested += amtPer;
    cumFees += Math.min(fee, amtPer);
    buys.push({
      i, price, execPrice, gross: amtPer, fee: Math.min(fee, amtPer), net, units,
      cumUnits, cumInvested, cumFees,
      avgEntry: cumUnits > 0 ? cumInvested / cumUnits : 0,
    });
  }
  const units = cumUnits;
  return {
    buys,
    entries: entryPrices.length,
    amtPer,
    totalInvested: cumInvested,
    totalFees: cumFees,
    netInvested: cumInvested - cumFees,
    units,
    // Gross-basis average entry (v1 definition: capital / tokens).
    avgEntry: units > 0 ? cumInvested / units : 0,
  };
}

export function lumpSumOutcome({ capital, startPrice, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const r = executeDca({ amtPer: capital, entryPrices: [startPrice], feePct, feeFixed, slippagePct });
  return { ...r, strategy: "lump" };
}

// initialPct% deployed at startPrice today, the rest DCA'd over entryPrices.
export function hybridOutcome({ capital, initialPct, startPrice, entryPrices, feePct = 0, feeFixed = 0, slippagePct = 0 }) {
  const upfront = capital * (initialPct / 100);
  const rest = capital - upfront;
  const lump = upfront > 0
    ? executeDca({ amtPer: upfront, entryPrices: [startPrice], feePct, feeFixed, slippagePct })
    : { units: 0, totalInvested: 0, totalFees: 0, buys: [] };
  const dca = rest > 0
    ? executeDca({ amtPer: rest / entryPrices.length, entryPrices, feePct, feeFixed, slippagePct })
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
