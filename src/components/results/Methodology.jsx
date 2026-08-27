// "How CMVNG calculates this" — the trust panel. Written for non-technical
// readers; every mode and assumption disclosed.

import React from "react";
import { T, SANS, body } from "../../styles/theme.js";
import { Collapsible } from "../ui.jsx";
import { MODEL_LABEL } from "../../lib/version.js";

const H = ({ children }) => <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.ink, margin: "14px 0 4px" }}>{children}</div>;
const P = ({ children }) => <p style={{ ...body, margin: "0 0 4px" }}>{children}</p>;
const Strong = ({ children }) => <span style={{ fontWeight: 600, color: T.ink }}>{children}</span>;

export default function Methodology({ mode = "scenario" }) {
  return (
    <Collapsible title="How CMVNG calculates this" subtitle={`${MODEL_LABEL} · scenario simulator, not a prediction of future returns`}>
      <P><Strong>This is a scenario simulator, not a prediction of future returns.</Strong> Historical data is evidence for stress-testing a plan — it does not tell you what will happen next.</P>

      <H>1. Data source</H>
      <P>Market data comes from CoinGecko: the top 250 coins by market cap (stablecoins and wrapped/staked tokens excluded), live prices refreshed about every 30–60 seconds, and up to 365 days of daily closing prices. Every data panel shows when its data was last updated; stale cached data is labeled.</P>

      <H>2. Historical window</H>
      <P>The simulation uses a historical window exactly as long as your plan: a 3-month plan uses the last 90 days of prices, a 1-month plan the last 30. The window used is always displayed in the results.</P>

      <H>3. Price normalization (scenario mode)</H>
      <P>In the default scenario mode, the historical window's prices are scaled so their average sits on today's live price. That keeps the real shape of the market's movement (dips, rallies, volatility) while anchoring the whole range to where the coin trades now. Entry prices are then sampled evenly across that scaled window. This produces a plausible path, not a forecast.</P>

      <H>4. DCA schedule</H>
      <P>A month counts as 30 days. Number of purchases = plan days ÷ frequency days, rounded, and kept between 4 and 180. Your capital is split evenly; the first purchase is on day 0 and purchase <em>n</em> happens <em>n</em> × frequency-days later. Daily closing prices stand in for execution prices (see fees & slippage).</P>

      <H>5. Fees & slippage</H>
      <P>Optional. A percentage and/or fixed fee is deducted from every purchase before buying, so units bought reflect the fee. The optional slippage assumption raises every execution price by the chosen amount, because historical closes are not guaranteed executable prices. Both default to zero.</P>

      <H>6. Scenario construction</H>
      <P>Flat, −20% and −50% are fixed assumptions applied to the live price. "Historical worst-like" and "strong upside" scenarios use the worst and best moves actually observed across all completed windows of your plan's length in the past year — their sources are labeled on each card. Your target is your own chosen test case.</P>

      <H>7. Reality Check & rolling windows</H>
      <P>The Reality Check compares your target against every completed window of your plan's length in the past year: "typical" is the median absolute move, and the labels are fixed rules (within typical → Relatively modest; within 2× typical → Moderate; within the largest observed gain → Ambitious; beyond it → Extreme). Rolling windows re-run your exact plan on each of those historical windows and report best / median / worst. These are historical outcomes, never probabilities.</P>

      <H>8. CMVNG Model Score</H>
      <P>A deterministic heuristic (−5…+5) built from trend, momentum and range position over the last 120 days — see "How this is calculated" in Market Conditions. It is explainable and consistent, but it is a rule of thumb, not a scientifically calibrated probability.</P>

      {mode === "backtest" && (
        <>
          <H>Historical backtest mode</H>
          <P>Backtests use actual historical prices and dates with no scaling or normalization — "if you had started on that date, this is what those prices did." Past performance does not determine future results.</P>
        </>
      )}

      <H>Limitations</H>
      <P>One year of daily closes is a small sample. Extreme events outside it are invisible to every analysis here. Simulated paths reuse past behaviour; markets change regimes. Taxes, spreads, exchange availability and your own discipline are not modeled. Nothing on this page is financial advice — do your own research.</P>
    </Collapsible>
  );
}
