// Assumptions drawer — a pure spec sheet of what the simulation actually
// assumed on this run. Reads engine-result fields only; computes nothing.

import React from "react";
import { body, monoLabel } from "../styles/theme.js";
import { Collapsible, SpecRow } from "./ui.jsx";
import { MODEL_LABEL } from "../lib/version.js";

export default function AssumptionsDrawer({ sim, mode }) {
  if (!sim) return null;
  const backtest = mode === "backtest";
  const cfg = sim.config || {};
  const feePct = cfg.feePct ?? 0;
  const feeFixed = cfg.feeFixed ?? 0;
  const slippagePct = cfg.slippagePct ?? 0;

  const rows = [
    ["Data source", "coingecko daily closes · up to 365 days"],
    ["Historical window", backtest ? "actual period prices" : `last ${sim.windowDays ?? "—"} days`],
    ["Price basis", backtest ? "actual historical prices (backtest)" : "window scaled to live price (scenario mode)"],
    ["Schedule", `${sim.entries ?? "—"} purchases · every ${sim.freq?.label?.toLowerCase() ?? ""} · month = 30 days`],
    ["Fee per purchase", feePct === 0 && feeFixed === 0 ? "none" : `${feePct}% + $${feeFixed} fixed`],
    ["Slippage assumption", slippagePct === 0 ? "0% — closes treated as executable" : `${slippagePct}%`],
  ];
  if (!backtest && cfg.hybridPct != null) {
    rows.push(["Hybrid split", `${cfg.hybridPct}% upfront / ${100 - cfg.hybridPct}% dca`]);
  }
  rows.push(["Model version", MODEL_LABEL]);
  const hasSeed = sim.seed != null;
  if (hasSeed) rows.push(["Seed", String(sim.seed)]);

  return (
    <Collapsible title="assumptions used in this run">
      {rows.map(([label, value], i) => (
        <SpecRow key={label} label={label} last={i === rows.length - 1}>{value}</SpecRow>
      ))}
      {hasSeed && (
        <div style={{ ...monoLabel, marginTop: 6, marginBottom: 0 }}>
          distribution mode is deterministic under this seed
        </div>
      )}
      <div style={{ ...body, marginTop: 10 }}>
        every figure on this page follows from these assumptions — change them under advanced options.
      </div>
    </Collapsible>
  );
}
