// Saved plans + live tracking. Local-first (localStorage). Each plan shows
// the model version that produced it; tracked plans compare plan vs reality
// using real prices since activation. CLEAR BLUE: soft floating card, plan
// rows as gentle insets, pill-chip actions, friendly empty state.

import React, { useEffect, useState } from "react";
import { T, SANS, monoLabel, body, plColor } from "../styles/theme.js";
import { Section, SectionLabel, SpecRow, CoinImg, Mascot } from "./ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../lib/formatting/money.js";
import { fmtPct } from "../lib/formatting/percentage.js";
import { fmtDate } from "../lib/formatting/dates.js";
import { trackingProgress } from "../lib/savedPlans.js";
import { getFreq } from "../lib/simulation/dca.js";
import { getLivePrice, getHistory } from "../services/api.js";

// small pill-chip action button
const chip = {
  padding: "8px 14px", borderRadius: 100, cursor: "pointer",
  fontFamily: SANS, fontSize: 12, fontWeight: 600,
  border: `1px solid ${T.line}`, background: T.card, color: T.ink2,
};
// Load — the one soft-blue action per row
const chipLoad = {
  ...chip, border: `1px solid ${T.blueSoft}`, background: T.blueSoft, color: T.blue, fontWeight: 700,
};

export default function SavedPlansPanel({ plans, onLoadPlan, onRemove, onStartTracking, onStopTracking, onClose }) {
  return (
    <Section ariaLabel="Saved plans">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <SectionLabel eyebrow style={{ marginBottom: 0 }}>my saved plans</SectionLabel>
        <button onClick={onClose} aria-label="Close saved plans" style={chip}>Close</button>
      </div>
      {plans.length === 0 && (
        <div style={{ padding: "26px 16px 14px", textAlign: "center" }}>
          <Mascot size={72} style={{ margin: "0 auto 16px" }} />
          <div style={{ ...body, textAlign: "center" }}>
            No saved plans yet — run a simulation and hit "Save this plan".
          </div>
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
    <div style={{ background: T.card2, borderRadius: 16, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CoinImg src={plan.coin.image} symbol={plan.coin.symbol} size={30} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: T.ink }}>
            {plan.coin.symbol.toUpperCase()}
            <span style={{ fontWeight: 600, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>
              {" · "}{fmtUSD(plan.config.capital)} · {plan.config.months}mo · +{plan.config.targetPct}%
            </span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.ink3, marginTop: 2 }}>
            saved {fmtDate(plan.createdAt)} · model v{plan.modelVersion}{tracked ? " · tracking" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onLoad} style={chipLoad}>Load</button>
          {tracked
            ? <button onClick={onUntrack} style={chip}>Stop tracking</button>
            : <button onClick={onTrack} style={chip}>Start tracking</button>}
          <button onClick={onRemove} aria-label="Delete plan" style={{ ...chip, color: T.loss }}>Delete</button>
        </div>
      </div>

      {tracked && progress && (
        <div style={{ marginTop: 12 }}>
          <SectionLabel eyebrow style={{ marginBottom: 4 }}>live tracking — plan vs reality</SectionLabel>
          <SpecRow label="Days elapsed">{progress.daysElapsed} / {progress.totalDays}</SpecRow>
          <SpecRow label="Purchases (per schedule)">{progress.buysDone} / {progress.entries}</SpecRow>
          <SpecRow label="Capital deployed">{fmtUSD(progress.deployed)}</SpecRow>
          <SpecRow label={`${plan.coin.symbol.toUpperCase()} accumulated`}>{fmtTok(progress.units)}</SpecRow>
          <SpecRow label="Avg entry">{fmtPrice(progress.avgEntry)}</SpecRow>
          <SpecRow label="Current value">
            <span style={{ color: plColor(progress.pnl) }}>{fmtUSD(progress.value)} ({fmtPct(progress.pnlPct)})</span>
          </SpecRow>
          <SpecRow label="Progress to target price" last>{progress.targetProgressPct.toFixed(0)}%</SpecRow>
          <div style={{ ...body, fontSize: 12, color: T.ink3, marginTop: 6 }}>
            Assumes the schedule was followed, using daily closing prices since activation — an approximation of real executions.
          </div>
        </div>
      )}
    </div>
  );
}
