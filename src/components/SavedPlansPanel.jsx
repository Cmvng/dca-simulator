// Saved plans + live tracking. Local-first (localStorage). Each plan shows
// the model version that produced it; tracked plans compare plan vs reality
// using real prices since activation. INSTRUMENT: hairline rows, mono meta.

import React, { useEffect, useState } from "react";
import { T, SANS, MONO, HAIRLINE_2, monoLabel, body, plColor } from "../styles/theme.js";
import { Section, SectionLabel, SpecRow, CoinImg } from "./ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../lib/formatting/money.js";
import { fmtPct } from "../lib/formatting/percentage.js";
import { fmtDate } from "../lib/formatting/dates.js";
import { trackingProgress } from "../lib/savedPlans.js";
import { getFreq } from "../lib/simulation/dca.js";
import { getLivePrice, getHistory } from "../services/api.js";

// small secondary text button — hairline, square, no fill
const btnSmall = {
  padding: "7px 12px", borderRadius: 0, cursor: "pointer",
  fontFamily: SANS, fontSize: 12, fontWeight: 400,
  border: `1px solid ${T.line}`, background: T.paper, color: T.ink,
};

export default function SavedPlansPanel({ plans, onLoadPlan, onRemove, onStartTracking, onStopTracking, onClose }) {
  return (
    <Section ariaLabel="Saved plans">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <SectionLabel style={{ marginBottom: 0 }}>my saved plans</SectionLabel>
        <button onClick={onClose} aria-label="Close saved plans" style={btnSmall}>Close</button>
      </div>
      {plans.length === 0 && (
        <div style={{ ...body, marginTop: 12 }}>
          No saved plans yet — run a simulation and hit "Save this plan".
        </div>
      )}
      {plans.map(p => (
        <PlanRow key={p.id} plan={p}
          onLoad={() => onLoadPlan(p)} onRemove={() => onRemove(p.id)}
          onTrack={() => onStartTracking(p)} onUntrack={() => onStopTracking(p.id)} />
      ))}
      <div style={{ ...monoLabel, marginTop: 14, marginBottom: 0 }}>
        plans are stored only in this browser · each keeps the simulation model version that produced it
      </div>
    </Section>
  );
}

function PlanRow({ plan, onLoad, onRemove, onTrack, onUntrack }) {
  const [progress, setProgress] = useState(null);
  const tracked = !!plan.tracking;

  useEffect(() => {
    if (!tracked) { setProgress(null); return; }
    let alive = true;
    (async () => {
      try {
        const [lp, h] = await Promise.all([getLivePrice(plan.coin.id), getHistory(plan.coin.id)]);
        if (!alive || !lp) return;
        const freq = getFreq(plan.config.freqId);
        setProgress(trackingProgress(plan, { livePrice: lp.data.price, prices: h?.data?.prices || [], freqDays: freq.days }));
      } catch { /* tracking view degrades silently */ }
    })();
    return () => { alive = false; };
  }, [plan, tracked]);

  return (
    <div style={{ borderTop: HAIRLINE_2, marginTop: 14, paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CoinImg src={plan.coin.image} symbol={plan.coin.symbol} size={28} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.ink }}>
            {plan.coin.symbol.toUpperCase()}
            <span style={{ fontFamily: MONO, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
              {" · "}{fmtUSD(plan.config.capital)} · {plan.config.months}mo · +{plan.config.targetPct}%
            </span>
          </div>
          <div style={{ ...monoLabel, marginTop: 2, marginBottom: 0 }}>
            saved {fmtDate(plan.createdAt)} · model v{plan.modelVersion}{tracked ? " · tracking" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onLoad} style={btnSmall}>Load</button>
          {tracked
            ? <button onClick={onUntrack} style={{ ...btnSmall, color: T.ink2 }}>Stop tracking</button>
            : <button onClick={onTrack} style={btnSmall}>Start tracking</button>}
          <button onClick={onRemove} aria-label="Delete plan" style={{ ...btnSmall, color: T.loss }}>Delete</button>
        </div>
      </div>

      {tracked && progress && (
        <div style={{ marginTop: 12 }}>
          <SectionLabel>live tracking — plan vs reality</SectionLabel>
          <SpecRow label="Days elapsed">{progress.daysElapsed} / {progress.totalDays}</SpecRow>
          <SpecRow label="Purchases (per schedule)">{progress.buysDone} / {progress.entries}</SpecRow>
          <SpecRow label="Capital deployed">{fmtUSD(progress.deployed)}</SpecRow>
          <SpecRow label={`${plan.coin.symbol.toUpperCase()} accumulated`}>{fmtTok(progress.units)}</SpecRow>
          <SpecRow label="Avg entry">{fmtPrice(progress.avgEntry)}</SpecRow>
          <SpecRow label="Current value">
            <span style={{ color: plColor(progress.pnl) }}>{fmtUSD(progress.value)} ({fmtPct(progress.pnlPct)})</span>
          </SpecRow>
          <SpecRow label="Progress to target price" last>{progress.targetProgressPct.toFixed(0)}%</SpecRow>
          <div style={{ ...body, fontSize: 12, marginTop: 6 }}>
            Assumes the schedule was followed, using daily closing prices since activation — an approximation of real executions.
          </div>
        </div>
      )}
    </div>
  );
}
