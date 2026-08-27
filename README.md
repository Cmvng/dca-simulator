# CMVNG DCA Simulator

A crypto DCA **decision engine**: build a dollar-cost-averaging plan, stress-test it against
realistic market conditions, compare it with lump-sum deployment, and share or track it.

> This is a **scenario simulator, not a prediction of future returns**. Historical data is
> evidence for stress-testing — never a forecast. Not financial advice · DYOR.

## Features

- **Top 250 coins** (CoinGecko; stablecoins/wrapped assets filtered) with search, quick filters,
  live prices and honest "Updated X ago" staleness labels
- **Plan builder**: capital (presets + validation), 12h/daily/weekly/bi-weekly frequency,
  1–6 months, target *scenario* (+10…+200% or custom), instant schedule preview
- **Scenario simulation** (v1-preserved methodology): duration-matched historical window,
  scaled to the live price; target/flat/downside outcomes computed from the live price
- **Historical backtest mode**: real past prices and dates, no scaling — "what actually happened"
- **Reality Check**: your target vs the historical record (deterministic, documented thresholds)
- **Rolling windows**: the same plan over every completed window of its length — best/median/worst
- **DCA vs Hybrid vs Lump Sum** at identical capital and evaluation price
- **Risk**: max simulated drawdown, break-even ladder, target-price card
- **Advanced options** (progressive disclosure): per-purchase % + fixed fees, slippage assumption,
  hybrid split, and a seeded 10,000-path distribution mode (bootstrap of historical daily returns)
- **Interactive SVG chart** + collapsible, auditable purchase timeline
- **Sharing**: canvas cards in X (1200×675), square (1080×1080) and story (1080×1920) formats,
  plus shareable plan URLs (config-only, no personal data)
- **Saved plans & tracking** (localStorage): each plan records the simulation model version;
  tracked plans compare plan vs reality using real prices since activation
- Accessibility (labels, roles, focus states, reduced-motion) and mobile-first layout

## Getting started

```bash
npm install
npm run dev        # Vite dev server — /api/coins is served locally by a dev middleware
npm test           # 40 unit/invariant tests incl. behavior locks (node --test)
npm run build      # production build
```

Deployments: **Railway** (current production — `server.js` serves the build,
`/api/coins` and `/api/plans`; volume-backed `PLANS_DIR=/data`) or **Vercel**
(static build + edge function; public-plan links gracefully fall back to hash
links there). Optional env: `COINGECKO_API_KEY`. Design law: `DESIGN.md`
("CLEAR BLUE"). Gate harnesses: `npm run smoke`, `npm run e2e:plans`.

## Architecture

```
api/coins.js            Vercel Edge proxy: list / 365d history / price / image (edge-cached)
src/
  App.jsx               orchestration only
  components/           UI (results/ holds the results-page sections)
  hooks/                useCoins, useMarketData, useSimulation, useSavedPlans
  services/api.js       fetch + localStorage cache + staleness + stale fallback
  lib/
    simulation/         pure, tested engine: dca, historical, scenarios, scoring,
                        statistics, monteCarlo, validate, engine (orchestrator)
    formatting/         money, percentage, dates
    sharing/shareCard.js canvas share cards (3 formats)
    planUrl.js          shareable plan links (hash-encoded, validated on decode)
    savedPlans.js       local plans + tracking (model-versioned)
    analytics.js        no-op-safe event layer (plausible/gtag if present)
    version.js          MODEL_VERSION — bump when calculations change
```

The v1 numbers are protected by an equivalence test: `src/lib/simulation/engine.test.js`
contains a verbatim copy of the original `runSim`/`analyzeMarket` and asserts the refactored
engine reproduces them exactly with default options.

See `docs/PROJECT_OVERVIEW.md` for the full write-up, `docs/CHECKPOINT.md` for current status,
and the in-app "How CMVNG calculates this" panel for the user-facing methodology.
