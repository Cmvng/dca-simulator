// Saved plans + live tracking. Local-first (localStorage). Each plan shows
// the model version that produced it; tracked plans compare plan vs reality
// using real prices since activation.

import React, { useEffect, useState } from "react";
import { G, card, secLabel, btnGhost } from "../styles/theme.js";
import { CoinImg, InfoRow } from "./ui.jsx";
import { fmtUSD, fmtPrice, fmtTok } from "../lib/formatting/money.js";
import { fmtPct } from "../lib/formatting/percentage.js";
import { fmtDate } from "../lib/formatting/dates.js";
import { trackingProgress } from "../lib/savedPlans.js";
import { getFreq } from "../lib/simulation/dca.js";
import { getLivePrice, getHistory } from "../services/api.js";

export default function SavedPlansPanel({ plans, onLoadPlan, onRemove, onStartTracking, onStopTracking, onClose }) {
  return (
    <section style={{ ...card, border: `2px solid ${G.greenBorder}` }} aria-label="Saved plans">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ ...secLabel, marginBottom: 0 }}>My saved plans</div>
        <button onClick={onClose} aria-label="Close saved plans" style={{ ...btnGhost, padding: "6px 12px" }}>Close ✕</button>
      </div>
      {plans.length === 0 && <div style={{ fontSize: 13, color: G.muted, marginTop: 12 }}>No saved plans yet — run a simulation and hit "Save this plan".</div>}
      {plans.map(p => (
        <PlanRow key={p.id} plan={p}
          onLoad={() => onLoadPlan(p)} onRemove={() => onRemove(p.id)}
          onTrack={() => onStartTracking(p)} onUntrack={() => onStopTracking(p.id)} />
      ))}
      <div style={{ fontSize: 11, color: G.muted, marginTop: 12 }}>
        Plans are stored only in this browser. Each keeps the simulation model version that produced it.
      </div>
    </section>
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
    <div style={{ border: `1px solid ${G.border}`, borderRadius: 12, padding: "12px 14px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CoinImg src={plan.coin.image} symbol={plan.coin.symbol} size={28} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {plan.coin.symbol.toUpperCase()} · {fmtUSD(plan.config.capital)} · {plan.config.months}mo · +{plan.config.targetPct}%
          </div>
          <div style={{ fontSize: 11, color: G.muted }}>
            Saved {fmtDate(plan.createdAt)} · model v{plan.modelVersion}{tracked ? " · TRACKING" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onLoad} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }}>Load</button>
          {tracked
            ? <button onClick={onUntrack} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, color: G.amber }}>Stop tracking</button>
            : <button onClick={onTrack} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, color: G.green }}>Start tracking</button>}
          <button onClick={onRemove} aria-label="Delete plan" style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, color: G.red }}>Delete</button>
        </div>
      </div>

      {tracked && progress && (
        <div style={{ marginTop: 10, background: G.surfaceAlt, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Live tracking — plan vs reality
          </div>
          <InfoRow label="Days elapsed">{progress.daysElapsed} / {progress.totalDays}</InfoRow>
          <InfoRow label="Purchases (per schedule)">{progress.buysDone} / {progress.entries}</InfoRow>
          <InfoRow label="Capital deployed">{fmtUSD(progress.deployed)}</InfoRow>
          <InfoRow label={`${plan.coin.symbol.toUpperCase()} accumulated`}>{fmtTok(progress.units)}</InfoRow>
          <InfoRow label="Avg entry">{fmtPrice(progress.avgEntry)}</InfoRow>
          <InfoRow label="Current value">
            <span style={{ color: progress.pnl >= 0 ? G.green : G.red }}>{fmtUSD(progress.value)} ({fmtPct(progress.pnlPct)})</span>
          </InfoRow>
          <InfoRow label="Progress to target price" last>{progress.targetProgressPct.toFixed(0)}%</InfoRow>
          <div style={{ fontSize: 11, color: G.muted, marginTop: 6 }}>
            Assumes the schedule was followed, using daily closing prices since activation — an approximation of real executions.
          </div>
        </div>
      )}
    </div>
  );
}
