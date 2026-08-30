# CMVNG DCA Simulator

A crypto DCA **decision engine** with two product modes:

- **Contract DCA** — paste an indexed token contract or mint address, measure its recent pool volatility, choose an amount, buy frequency, duration, and target, then inspect one scheduled DCA illustration.
- **Top 250 simulator** — build, stress-test, backtest, compare, save, and share a DCA plan for established CoinGecko assets.

> This is a scenario simulator, not a prediction, order, or token-safety certificate. Historical data informs an illustrative sample; it does not forecast the future. Not financial advice · DYOR.

## Production

The simple scheduled-DCA redesign is live at [web-production-84b5c.up.railway.app](https://web-production-84b5c.up.railway.app). It was merged in [PR #6](https://github.com/Cmvng/dca-simulator/pull/6) at commit `c957777e9ab9bc7a9963c8eb792ba7a5a54a3cfd`. Production chart hardening followed in [PR #7](https://github.com/Cmvng/dca-simulator/pull/7) at `dd24717efac45163e78aa8ae17aac4fb1e11fd05`; Railway deployment `a5d32f46-606d-4fec-bcc6-e2ee49b9e284` completed with `SUCCESS`.

Release verification passed full lint, all 100 tests, the production build, and the diff check. Live STONK acceptance confirmed the token/volatility header, four plan inputs, all five cadence choices, one scheduled chart, Price/MCAP/FDV modes, `B` markers, moving average entry, target-close and risk-review references, the compact summary, the plan-card section, and the collapsed calculation/pool/safety disclosure. A reload preserved `$123.45`, every 6 hours, 7 days, a 50% target, the derived `1H` evidence interval, and 28 scheduled buys. Price, FDV, and MCAP persisted when selected; card generation produced the STONK scheduled-DCA PNG preview with **Download PNG** and **Copy live link** actions.

That live pass exposed a Lightweight Charts `unexpected base` console error. PR #7 fixed it by supplying the explicit `1e18` price-format base and added a smoke regression. Fresh-tab retesting across Price, FDV, and MCAP produced zero app-origin console errors; the root route also loaded with zero app-origin errors. The local browser smoke still could not run because this environment had no usable Chromium binary, but equivalent live-browser acceptance passed against production.

## Features

### Contract DCA

- Exact contract/mint matching against GeckoTerminal pool relationships; fuzzy name and symbol matches are discarded.
- Automatic network discovery and deterministic highest-liquidity pool selection, with volume as a tiebreaker and alternative exact pools available under technical details.
- One deliberately simple path: **contract address → volatility → amount/frequency/duration/target → chart → summary → share card**.
- A plain-language volatility category plus the measured typical daily swing, calculated from close-to-close realized log returns. “Stable-like” describes observed price behavior only; it does not certify a stablecoin or a durable peg.
- Five buy cadences: every hour, every 6 hours, every 12 hours, every day, and every week.
- A whole-day duration from 7 through 90 days and a custom profit target from the simulated running average entry.
- An exact, end-exclusive calendar: the first buy occurs at the plan start and later buys occur exactly one cadence apart. There is no hidden purchase-count cap; a 90-day hourly plan contains 2,160 intended buys.
- Integer-cent budget allocation. Every cent is conserved, and a plan is blocked when its budget cannot fund at least one cent per intended buy.
- One reproducible, seeded illustrative candle sample anchored to the current quote. It bootstraps centered historical return/wick shapes and scales them to measured volatility; it is explicitly **not a forecast, expected path, probability, or trading signal**.
- A Fomo-style Lightweight Charts view with muted real history, bright illustrative candles, grouped green `B` buy markers, a moving average-entry line, a moving orange target-close line, and a moving red risk-review line.
- The target and review levels recalculate after every simulated buy. A qualifying sample close stops later simulated buys for review; no token sale, exchange order, guaranteed fill, fee, gas, tax, slippage, or price impact is modeled.
- Price, implied market-cap, and implied FDV chart/summary modes. MCAP and FDV use the provider’s current price-to-valuation ratio, assume that ratio remains constant, and are never presented as historical valuation candles.
- A compact result summary showing the schedule, amount per buy, volatility, target, risk-review level, and whether either level was reached in this one sample.
- Square and story PNG share cards containing the token, amount, cadence, duration, planned buy count, amount per buy, volatility, target, risk review, pool provenance, timestamps, and simulation disclaimers.
- Blocking gates for price, candle count/duration, interval density, candle freshness, liquidity, and extreme quote/candle divergence. Low per-buy amounts, limited history, extreme modeled moves, and stable-looking behavior produce explicit warnings.
- Request IDs plus cancellation prevent stale responses. Address, pool, evidence interval, amount, duration, frequency, target, and value-unit URL state make a complete plan refreshable and shareable.
- Pool identity, evidence quality, methodology, warnings, and safety limitations remain available under one collapsed “How this was calculated, pool and safety” section.

The former primary `B1`–`B4` price-zone/profile studio has been removed from the main contract experience. Its ladder code is retained only as a possible future advanced strategy and must not be mixed into the simple scheduled-DCA flow without separately labelled assumptions and tests.

### Top 250 decision engine

- Top 250 assets with search, live prices, 365-day histories, and honest staleness labels.
- Scenario simulation, real historical backtests, rolling windows, and a seeded statistical mode.
- DCA vs hybrid vs lump sum, fees/slippage assumptions, drawdown, break-even, and reality checks.
- Saved/tracked plans, share-card formats, and public plan links.
- Integer-cent money engine protected by behavior locks and a model version.

## Getting started

```bash
npm install
npm run dev        # Vite plus local /api middleware
npm test           # simulation, scheduled-DCA, share-card, store, and onchain tests
npm run lint
npm run build
```

The GeckoTerminal contract path is keyless. `COINGECKO_API_KEY` is optional for the established-asset route. The standalone Railway-compatible server is available with `npm start` after a build.

Other verification commands:

```bash
npm run smoke
npm run smoke:onchain
npm run e2e:plans
```

The browser harnesses use `CHROME_PATH` when Chromium is installed outside the default image path. The current scheduled-DCA browser smoke is implemented, but it could not be executed in the latest local environment because no usable Chromium binary was installed.

## Architecture

| Area | Files | Responsibility |
| --- | --- | --- |
| Product shell | `src/AppShell.jsx`, `src/main.jsx` | Keeps the established planner on `/` and lazy-loads contract analysis on `/contract`. |
| Contract flow | `src/components/OnchainAnalyzer.jsx` | Exact-address resolution, pool/candle requests, simple plan inputs, quality states, URL persistence, and progressive disclosure. |
| Scheduled chart and summary | `src/components/ScheduledDcaChart.jsx`, `src/components/ScheduledPlanSummary.jsx` | Real-history context, illustrative sample candles, scheduled markers, moving levels, valuation modes, accessible buy data, and plain-language outcomes. |
| Scheduled onchain engine | `src/lib/onchain/scheduledDca.js` | Exact calendar/cent allocation, realized volatility, deterministic seed, illustrative sample, simulated buys, moving target/review levels, and terminal-event logic. |
| Shared onchain evidence | `src/lib/onchain/dcaEngine.js` | Candle normalization, ATR and market-data quality gates, plus valuation-ratio helpers reused by scheduled DCA. Legacy zone-profile calculations remain non-primary. |
| Contract share cards | `src/components/OnchainSharePanel.jsx`, `src/lib/sharing/onchainShareModel.js`, `src/lib/sharing/onchainShareCard.js` | Scheduled-plan card UI, normalized model, and square/story PNG rendering. |
| Onchain routes | `api/token.js`, `api/candles.js`, `api/_onchain.js` | Exact pool discovery, normalized OHLCV, validation, caching, and provider-error handling. |
| Established-asset app | `src/App.jsx`, `src/components/`, `src/hooks/` | Existing plan builder, results, retention, sharing, and public-plan experience. |
| Versioned simulator | `src/lib/simulation/` | Behavior-locked v3 numerical engine plus the cent-allocation helpers reused by the contract scheduler. |
| Hosting | `vite.config.js`, `server.js`, `api/` | Local middleware, Railway Node server, and Vercel-compatible handlers. |

The contract flow is deterministic for the same address, pool data, plan inputs, and seed:

1. `/api/token` searches by address and discards every pool without an exact base/quote address match.
2. The strongest active pool is selected by liquidity, then volume; alternatives remain user-selectable under technical details.
3. Buy cadence automatically selects `1H`, `4H`, or `1D` evidence. `/api/candles` verifies the exact token/pool relationship and returns validated chronological OHLCV.
4. Market-data gates either block the plan or produce a measured daily-volatility category and exact purchase calendar.
5. The scheduler allocates the full budget in cents across every intended buy, without the established simulator’s legacy 180-entry cap.
6. A seeded centered-return bootstrap draws one bright illustrative sample after the muted real-history context. Dense buy schedules are grouped visually while their exact schedule and calculations remain intact.
7. Running average, profit-target, and risk-review levels update after each simulated purchase. A sample close at either conditional level pauses later simulated buys; it does not execute a sale.
8. The same plan can be read in Price, implied MCAP, or implied FDV and exported as a share card.

## What “supported” means

A token is supported only when GeckoTerminal indexes an exact matching active pool, returns a positive USD price and liquidity, confirms the token in the selected pool’s OHLCV metadata, and supplies enough usable history. The current base gate requires at least 20 valid candles spanning 24 hours, reasonable requested-interval coverage, a fresh latest candle, at least $10,000 reported pool liquidity, and no extreme live-quote/candle divergence.

This is deliberately narrower than “every token.” A token can be unsupported because its network is not indexed, it is still on a bonding curve, no active pool exists, the public search does not return the pool, or history is too weak. Those cases produce an error or blocking state instead of invented certainty.

Market cap and FDV remain separate. Missing market cap is shown as unavailable, never replaced with FDV. Market-data quality measures analysis usability, not safety or the probability of profit.

## Provider limits

The keyless GeckoTerminal API is beta and rate-limited. Its newer [keyless API guide](https://docs.coingecko.com/docs/keyless-public-api) describes a dynamic allowance of roughly 10 calls per minute, while the older [GeckoTerminal FAQ](https://apiguide.geckoterminal.com/faq) still documents 30. Capacity planning should use the lower figure and treat `429` as ordinary provider backpressure.

One scan normally uses one pool-search request and one candle request. Search and OHLCV responses are cached; a paid CoinGecko Onchain tier or stronger shared caching is the natural production upgrade if usage outgrows the public allowance.

Evidence resolution is selected automatically from the buy cadence: hourly evidence for 1-hour/6-hour buying, 4-hour evidence for 12-hour/daily buying, and daily evidence for weekly buying. Provider requests remain limited to 500 candles, so the UI reports the actual evidence span and never calls it all-time history.

## Safety limitations

- Contract market-data checks are **not a smart-contract audit**.
- The app does not yet detect honeypots, blocked selling, taxes, mutable mint/freeze permissions, blacklists, upgradeable proxies, transfer hooks, concentrated holders, deployer history, or LP lock/burn state.
- Reported liquidity and volume can be manipulated, fragmented, removed, or stale.
- No executable round-trip quote is requested, so the illustration excludes real routing, price impact, taxes, gas, slippage, failed transactions, and changing liquidity.
- The bright future sample is synthetic and seeded. It does not preserve historical trend, return autocorrelation, volatility clustering, or every possible tail event.
- A target or review crossing is a simulated candle-close reference. It pauses later simulated buys but does not model an actual sale, stop order, fill price, or recoverable loss limit.
- A token can become unsellable or lose 100%, including one whose recent behavior is labelled “Stable-like.”

GoPlus or another independent security provider, plus size-aware buy-and-sell quotes, should be added before presenting this as a trade-ready security screen.

## TradingView attribution

`lightweight-charts` renders the chart; GeckoTerminal supplies the historical market evidence. The scheduled chart includes a visible TradingView copyright/link while keeping the illustrative sample explicitly separate from real history.

## Project documentation

- `DESIGN.md` — current Clear Blue product design law.
- `docs/CHECKPOINT.md` — current implementation and verification state.
- `docs/MEMORY.md` — durable product, architecture, and safety decisions.
- `docs/RECOMMENDATIONS.md` — prioritized follow-up work.
- `docs/PROJECT_OVERVIEW.md` — the established-asset v2/v3 architecture and methodology.
