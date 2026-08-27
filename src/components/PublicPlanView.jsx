// Public /plan/<id> header card — CLEAR BLUE, read-only.
//
// Props contract (the host wires routing and renders the normal ResultsView
// below this card with the live simulation it runs):
//   record         { id, createdAt, modelVersion, config } from fetchPlan()
//   sim, analysis, live, history   pass-through market/simulation context the
//                  host owns — this card renders none of them; results appear
//                  in the host's ResultsView underneath
//   selected       the resolved coin { name, symbol, image } (may be null
//                  while the coin list loads)
//   onBuildYourOwn () => void — resets into the plan builder
//   canRevoke      boolean — true when this browser holds the owner token
//   onRevoke       () => void — remove the public plan (revocation)
//
// NO personal data is ever shown: a record is only plan parameters, a model
// version, and a timestamp.

import React from "react";
import { T, SANS, body, btnPrimary } from "../styles/theme.js";
import { Section, SpecRow, CoinImg, Pill } from "./ui.jsx";
import { imageProxyUrl } from "../services/api.js";
import { getFreq } from "../lib/simulation/dca.js";
import { fmtUSD } from "../lib/formatting/money.js";

export default function PublicPlanView({ record, selected, onBuildYourOwn, canRevoke, onRevoke }) {
  if (!record?.config) return null;
  const cfg = record.config;
  const freq = getFreq(cfg.freqId);
  const created = record.createdAt
    ? new Date(record.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const name = selected?.name || cfg.coinId;
  const symbol = selected?.symbol ? selected.symbol.toUpperCase() : "";
  const hasCosts = (cfg.feePct || 0) > 0 || (cfg.feeFixed || 0) > 0 || (cfg.slippagePct || 0) > 0;

  return (
    <Section label="Shared plan" eyebrow ariaLabel="Shared public plan">
      {/* coin identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <CoinImg src={imageProxyUrl(selected?.image)} symbol={selected?.symbol || cfg.coinId} size={38} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>
            {name}{symbol ? <span style={{ color: T.ink3, fontWeight: 600 }}> · {symbol}</span> : null}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 500, color: T.ink2, marginTop: 2 }}>
            A DCA plan someone shared publicly
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Pill>Read-only</Pill>
        </div>
      </div>

      {/* the plan spec */}
      <div style={{ marginTop: 8 }}>
        {cfg.capital != null && <SpecRow label="Capital">{fmtUSD(cfg.capital)}</SpecRow>}
        {cfg.freqId && <SpecRow label="Frequency">{freq.label}</SpecRow>}
        {cfg.months != null && <SpecRow label="Duration">{cfg.months} month{cfg.months > 1 ? "s" : ""}</SpecRow>}
        {cfg.hybridPct != null && <SpecRow label="Hybrid upfront">{cfg.hybridPct}%</SpecRow>}
        {hasCosts && (
          <SpecRow label="Costs">
            {cfg.feePct || 0}% + {fmtUSD(cfg.feeFixed || 0)} fee · {cfg.slippagePct || 0}% slippage
          </SpecRow>
        )}
        <SpecRow label="Target" last>+{cfg.targetPct != null ? cfg.targetPct : 50}%</SpecRow>
      </div>

      <p style={{ ...body, fontSize: 12.5, color: T.ink3, margin: "10px 0 14px" }}>
        Published with CMVNG Simulation v{record.modelVersion}{created ? ` · ${created}` : ""} ·
        results below are computed fresh from live market data
      </p>

      <button onClick={onBuildYourOwn} style={btnPrimary}>
        Build your own plan
      </button>

      {canRevoke && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button
            onClick={onRevoke}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "6px 10px",
              fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: T.loss,
            }}
          >
            Remove this public plan
          </button>
        </div>
      )}
    </Section>
  );
}
