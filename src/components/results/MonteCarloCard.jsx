// Distribution mode (Advanced) — 10,000 resampled paths. Reports the
// distribution, clearly labeled "model-based estimate" with methodology.

import React, { useEffect, useState } from "react";
import { G } from "../../styles/theme.js";
import { InfoRow, Collapsible } from "../ui.jsx";
import { Skeleton } from "../LoadingState.jsx";
import { fmtUSD } from "../../lib/formatting/money.js";
import { runMonteCarlo } from "../../lib/simulation/monteCarlo.js";

export default function MonteCarloCard({ sim, seed }) {
  const [mc, setMc] = useState(null);

  useEffect(() => {
    if (!sim) return;
    setMc(null);
    // Yield a frame so the card paints a skeleton before the compute burst.
    const t = setTimeout(() => {
      setMc(runMonteCarlo({
        dailyLogReturns: sim.dailyLogReturns,
        days: sim.windowDays,
        startPrice: sim.refPrice,
        amtPer: sim.amtPer,
        entries: sim.entries,
        targetPct: sim.config.targetPct,
        paths: 10000,
        seed,
        feePct: sim.config.feePct, feeFixed: sim.config.feeFixed, slippagePct: sim.config.slippagePct,
      }));
    }, 30);
    return () => clearTimeout(t);
  }, [sim, seed]);

  if (!sim) return null;
  if (!mc) return <Skeleton height={120} />;
  if (!mc.ok) return <div style={{ fontSize: 13, color: G.muted }}>{mc.reason}</div>;

  const rows = [
    ["10th percentile", mc.p10], ["25th percentile", mc.p25],
    ["Median", mc.p50], ["75th percentile", mc.p75], ["90th percentile", mc.p90],
  ];

  return (
    <div>
      <div style={{ fontSize: 13, color: G.muted, marginBottom: 8, lineHeight: 1.5 }}>
        {mc.paths.toLocaleString()} simulated paths over {sim.windowDays} days, each resampling this coin's historical daily returns. Ending portfolio value on {fmtUSD(mc.invested)} invested:
      </div>
      {rows.map(([l, v], i) => (
        <InfoRow key={l} label={l} last={i === rows.length - 1}>
          <span style={{ color: v >= mc.invested ? G.green : G.red }}>{fmtUSD(v)}</span>
        </InfoRow>
      ))}
      <div style={{ marginTop: 10, background: G.bluePale, border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: G.blue }}>
        <strong>Model-based estimate:</strong> {mc.probAboveTargetPct.toFixed(0)}% of these simulated paths ended at or above your +{sim.config.targetPct}% target.
        This is a property of the model below — not the real-world chance.
      </div>
      <div style={{ marginTop: 10 }}>
        <Collapsible title="Methodology & limitations" subtitle={`Deterministic seed ${mc.seed} — same inputs always reproduce this result`}>
          <div style={{ fontSize: 13, color: G.muted, lineHeight: 1.7 }}>
            Each path starts at the live price and, for every day of your plan, applies one daily return drawn at random (with replacement) from the returns actually observed in your plan-length historical window. Your exact DCA schedule buys along each path; the ending value uses that path's final price.
            <br /><br />
            <strong>Limitations:</strong> the model assumes future daily returns resemble the sampled window and are independent day-to-day. Real markets have regime changes, momentum/mean-reversion and fatter tails than any one-year sample. Treat the distribution as a stress-testing tool, not a forecast.
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
