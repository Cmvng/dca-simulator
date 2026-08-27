// Saved plans — localStorage first (no account system exists yet).
// Every saved plan records the model version that produced its numbers, so a
// future engine change never silently reinterprets an old result.

import { MODEL_VERSION } from "./version.js";

const KEY = "cmv_plans";
const MAX_PLANS = 30;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(plans) {
  try { localStorage.setItem(KEY, JSON.stringify(plans.slice(0, MAX_PLANS))); } catch { /* storage full/blocked */ }
}

export function listPlans() { return read(); }

export function savePlan({ coin, config, headline, mode = "scenario", seed = null }) {
  const plans = read();
  const plan = {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    modelVersion: MODEL_VERSION,
    mode,
    seed,
    coin: { id: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image },
    config,       // {capital, freqId, months, targetPct, feePct, feeFixed, slippagePct, hybridPct}
    headline,     // {refPrice, targetPrice, targetVal, targetROI, units, avgEntry, totalInvested}
    tracking: null,
  };
  write([plan, ...plans]);
  return plan;
}

export function deletePlan(id) {
  write(read().filter(p => p.id !== id));
}

// Turn a saved plan into a tracked plan: records the start moment and the
// price at activation so later sessions can compare plan vs reality.
export function startTracking(id, { startPrice }) {
  const plans = read();
  const p = plans.find(x => x.id === id);
  if (!p) return null;
  p.tracking = { startedAt: Date.now(), startPrice };
  write(plans);
  return p;
}

export function stopTracking(id) {
  const plans = read();
  const p = plans.find(x => x.id === id);
  if (p) { p.tracking = null; write(plans); }
}

// Progress of a tracked plan given current market data.
// Scheduled capital deployed so far follows the documented convention:
// buy i occurs at i × freqDays days after start.
export function trackingProgress(plan, { livePrice, prices, freqDays, now = Date.now() }) {
  if (!plan.tracking) return null;
  const { startedAt } = plan.tracking;
  const daysElapsed = (now - startedAt) / 86400000;
  const totalDays = plan.config.months * 30;
  const entries = plan.headline.entries;
  const amtPer = plan.config.capital / entries;
  const buysDone = Math.min(entries, Math.floor(daysElapsed / freqDays) + 1);

  // Reconstruct what following the plan would have bought, using real prices
  // since the start (daily closes as executions — an approximation, labeled).
  let units = 0, deployed = 0;
  const startIdx = prices.findIndex(p => p[0] >= startedAt);
  for (let i = 0; i < buysDone; i++) {
    const t = startedAt + i * freqDays * 86400000;
    let price = livePrice;
    if (startIdx >= 0) {
      const pt = prices.find(p => p[0] >= t);
      if (pt) price = pt[1];
    }
    if (price > 0) { units += amtPer / price; deployed += amtPer; }
  }
  const value = units * livePrice;
  return {
    daysElapsed: Math.floor(daysElapsed),
    totalDays,
    buysDone,
    entries,
    deployed,
    units,
    avgEntry: units > 0 ? deployed / units : 0,
    value,
    pnl: value - deployed,
    pnlPct: deployed > 0 ? ((value - deployed) / deployed) * 100 : 0,
    targetProgressPct: plan.headline.targetPrice > plan.tracking.startPrice
      ? Math.max(0, Math.min(100, ((livePrice - plan.tracking.startPrice) / (plan.headline.targetPrice - plan.tracking.startPrice)) * 100))
      : 0,
  };
}
