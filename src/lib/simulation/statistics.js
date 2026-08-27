// Pure statistical helpers shared by the simulation engine.

export const avg = a => a.reduce((s, v) => s + v, 0) / a.length;

export const std = a => {
  const m = avg(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

// p in [0,1], linear interpolation between closest ranks. Input need not be sorted.
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  if (sorted.length === 1) return sorted[0];
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const median = values => percentile(values, 0.5);

// Daily log returns from a price series.
export function logReturns(vals) {
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i - 1] > 0 && vals[i] > 0) out.push(Math.log(vals[i] / vals[i - 1]));
  }
  return out;
}

// Maximum drawdown of a value series.
// Returns percentages as negative numbers (e.g. -31.2).
export function maxDrawdown(values) {
  if (!values.length) return { drawdownPct: 0, peak: 0, trough: 0, peakIdx: 0, troughIdx: 0, recoveryIdx: null };
  let peak = values[0], peakIdx = 0;
  let best = { drawdownPct: 0, peak: values[0], trough: values[0], peakIdx: 0, troughIdx: 0, recoveryIdx: 0 };
  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) { peak = values[i]; peakIdx = i; continue; }
    const dd = peak > 0 ? ((values[i] - peak) / peak) * 100 : 0;
    if (dd < best.drawdownPct) {
      best = { drawdownPct: dd, peak, trough: values[i], peakIdx, troughIdx: i, recoveryIdx: null };
    }
  }
  if (best.recoveryIdx === null) {
    for (let i = best.troughIdx + 1; i < values.length; i++) {
      if (values[i] >= best.peak) { best.recoveryIdx = i; break; }
    }
  }
  return best;
}

export const isFiniteNumber = n => typeof n === "number" && Number.isFinite(n);
