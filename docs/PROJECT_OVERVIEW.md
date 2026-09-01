# CMVNG DCA Simulator — Project Overview

CMVNG is a crypto DCA decision engine with two deliberately separate product paths:

- **Established-asset planner** at `/` and `/plan/<id>`: time-scheduled DCA scenarios, historical backtests, comparisons, saving, tracking, and sharing.
- **Contract analyzer** at `/contract`: exact onchain pool discovery, real OHLCV, market-data gates, and a scheduled-DCA simulation with an explicitly illustrative sample path.

Neither path predicts future candles or certifies a token as safe.

## Stack and deployment

| Layer | Current implementation |
|---|---|
| Frontend | React 18, Vite 4, Plus Jakarta Sans, CLEAR BLUE design system |
| Established charts | Custom accessible SVG components |
| Contract chart | TradingView Lightweight Charts 5, lazy-loaded only on `/contract` |
| Pure engines | ES modules under `src/lib/simulation/` and `src/lib/onchain/` |
| Browser services | `src/services/` with cancellation and normalized errors |
| APIs | Fetch-style handlers in `api/`; Vite middleware locally; standalone Node server on Railway; Vercel-compatible edge exports |
| Persistence | localStorage for local plans; JSON-file store for public plans with hashed owner tokens and `PLANS_DIR` volume support |
| Verification | node:test, ESLint, Playwright harnesses, GitHub Actions lint/test/build CI |

Railway tracks `feat/cmvng-v2-upgrade`. Feature branches should be reviewed before merge; a side branch is not a deployment instruction.

## Repository map

```text
api/
  coins.js                 CoinGecko list/history/price/image proxy
  token.js                 Exact token/pool discovery
  candles.js               Token-oriented GeckoTerminal OHLCV
  _onchain.js              Validation, normalization, ranking, errors, cache policy
  plans.js                 Public-plan lifecycle and storage
src/
  main.jsx                 React root
  AppShell.jsx             Route split: established app vs lazy /contract
  App.jsx                  Established-asset orchestration
  components/
    OnchainAnalyzer.jsx    Contract workflow and risk/plan presentation
    ScheduledDcaChart.jsx  History context, illustrative sample candles, a11y
    results/               Established-asset results surfaces
  hooks/                   Established-asset request and simulation state
  services/
    api.js                 CoinGecko proxy client/cache
    onchainApi.js          Contract and candle client
  lib/
    simulation/            Behavior-locked CMVNG Simulation v3
    onchain/               Scheduled-DCA engine, evidence gates, formatters
    sharing/               Share-card rendering
    planApi.js             Public-plan client
    savedPlans.js          Local saved/tracked plans
server.js                  Railway/static server plus all API routes
vite.config.js             Same-origin local API adapters
tools/
  smoke.mjs                Established planner browser smoke
  onchain-smoke.mjs        Mocked contract/chart browser smoke
  plans-e2e.mjs            Public-plan create/view/revoke lifecycle
docs/                      Checkpoint, memory, methodology, and recommendations
```

## Established-asset engine

CMVNG Simulation v3.0.0 is behavior-locked. Money is allocated and rounded in integer cents; units and market prices remain continuous. Any intentional numerical change requires an explicit methodology change record and model-version decision.

The three modes remain separated and labelled:

1. **Scenario simulation:** scaled historical shape anchored to the current market, never an observed backtest or forecast.
2. **Historical backtest:** actual historical dates/prices with no scaling.
3. **Statistical mode:** seeded bootstrap paths, labelled as model-based estimates.

Public `/plan/<id>` pages, hash `#p=` shares, local plans, cards, tracking, and backtests all remain part of this path.

## Contract analyzer data flow

1. The user submits a contract or mint address.
2. `/api/token` searches GeckoTerminal, discards every fuzzy/non-exact relationship, and ranks active exact pools by liquidity then volume.
3. The response retains network, pool, token side, DEX, counter token, market snapshot, alternatives, provider, and resolution time.
4. `/api/candles` validates network/pool/token/timeframe parameters, asks GeckoTerminal for token-oriented OHLCV, verifies pool metadata, and returns sorted unique valid candles.
5. On a pool or timeframe change, prior candles and plan output are cleared; aborted or stale requests cannot replace the selected context.
6. The scheduled-DCA engine either blocks weak evidence or builds an exact end-exclusive purchase calendar with whole-cent budget allocation.
7. The chart draws muted real-history candles plus a clearly separated illustrative sample path with `B` buy markers and the moving `S` target and `X` review levels.
8. The plan summary repeats every amount, cadence, and level in text so the chart is actionable and accessible without implying future price movement.

## Onchain methodology and honesty rules

- The scheduled flow is calendar DCA against one exact pool; it is not the established v3 simulator.
- A simulation requires at least 20 valid candles spanning at least 24 elapsed hours, reasonable interval coverage, and a fresh latest candle.
- At least $10,000 pool liquidity and a reasonably aligned live quote/latest candle are required before any simulation is shown.
- Confidence uses elapsed duration plus candle count, liquidity, volume, pool age, volatility, and quote/candle divergence, all measured against the pinned evidence capture time.
- The sample path is a seeded bootstrap of centered historical return shapes, labelled illustrative and never a forecast.
- The `S` target equals the selected gain percentage above the running average entry, exactly; `S` and `X` closes stop only future simulated buys and never model a sale.
- Missing market cap, FDV, change, or transaction data remains unavailable rather than becoming zero or borrowing another field.
- Market-data confidence says nothing about honeypots, taxes, authorities, holders, deployer behavior, LP state, or sellability.
- No executable quote is requested yet; displayed levels exclude real price impact, routing, tax, gas, and slippage.

## API and caching

| Route | Provider/purpose | Typical cache policy |
|---|---|---|
| `/api/coins?type=list|history` | CoinGecko established-asset data | 12 h |
| `/api/coins?type=price` | CoinGecko live price | 60 s |
| `/api/coins?type=image` | Allow-listed CoinGecko image proxy | 7 d |
| `/api/token?address=...` | GeckoTerminal exact pool discovery | 60 s + stale window |
| `/api/candles?...` | GeckoTerminal OHLCV | timeframe-dependent short cache |
| `/api/plans` | Public plan create/get/revoke | no-store |

The standalone server caches successful GET responses only and includes the HTTP method in its cache key. Error and non-GET responses are never replayed from the GET cache.

## Running and validating

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
npm run smoke
npm run smoke:onchain
npm run e2e:plans
```

Browser harnesses accept `CHROME_PATH`. The latest exact results and environment-specific blockers live in `docs/CHECKPOINT.md`.

On narrow screens, DOM and visual order both remain chart-first: token context and all six metrics, timeframe, chart, execution map, then settings and deeper analysis. This avoids hiding the result below controls and keeps keyboard order aligned with the visual layout.

## Current priorities

The implementation baseline is complete, but trustworthy public launch still requires contract-security enrichment, independent sell simulation, executable size-aware quotes, abuse protection, and cross-pool divergence rules. See `docs/RECOMMENDATIONS.md` for the ordered backlog.

*Updated 2026-09-01 for CMVNG Simulation v3.0.0 and the scheduled-DCA contract analyzer (the legacy zone-ladder engine and its components have been removed).*
