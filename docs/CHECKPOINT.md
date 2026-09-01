# CHECKPOINT — CMVNG DCA Simulator

> Current working state. Update this file at the end of each implementation session.

**Date:** 2026-08-30

**Working branch:** `codex/contract-plan-studio`

**Working base:** `b0f5b554d622256763550fd7fbf61a3f2f0c7750`

**Production baseline:** Simple scheduled DCA with chart-base hardening, [PR #7](https://github.com/Cmvng/dca-simulator/pull/7) at `dd24717efac45163e78aa8ae17aac4fb1e11fd05`; Railway deployment `a5d32f46-606d-4fec-bcc6-e2ee49b9e284` was `SUCCESS`

**Current redesign status:** merged and deployed to [web-production-84b5c.up.railway.app](https://web-production-84b5c.up.railway.app)

**Core model:** CMVNG Simulation v3.0.0 remains behavior-locked
**Contract methodology:** Scheduled DCA simulation schema v1 under `src/lib/onchain/scheduledDca.js`

## Outcome

The `/contract` experience has been rebuilt around the owner’s clarified product: one understandable scheduled-DCA flow rather than a technical four-zone ladder.

The current primary path is:

**contract address → measured volatility → amount/frequency/duration/target → one simulated chart → plain summary → share card**

The former Deep pullback/Balanced/Early entry selector, `B1`–`B4` price-zone rail, `S1`/`X1` outcome grid, timeframe toolbar, and retrospective-touch controls are no longer part of the primary UI. The old ladder code has since been deleted from the repository; only the shared evidence helpers the scheduled plan consumes remain.

## Delivered in the simple scheduled-DCA redesign

- Exact contract and pool resolution is preserved, including deterministic strongest-pool selection, alternative exact pools, canonical token identity, request cancellation, and stale-response protection.
- The resolved token header now surfaces price, MCAP, FDV, and one plain volatility result: category plus measured typical daily swing.
- One four-field builder asks for:
  - total USD amount;
  - buy frequency;
  - whole-day duration from 7 through 90 days;
  - profit target from the simulated average buy.
- Five cadences are available: **every hour**, **every 6 hours**, **every 12 hours**, **every day**, and **every week**.
- Evidence resolution is chosen automatically from cadence: `1H` for 1-hour/6-hour buying, `4H` for 12-hour/daily buying, and `1D` for weekly buying. The evidence interval is not presented as a second “buy frequency.”
- The schedule is exact and end-exclusive. The first intended buy occurs at the start time; later buys are exactly one cadence apart; the end timestamp is excluded.
- There is no hidden purchase-count cap. A 90-day hourly plan produces all 2,160 intended purchases instead of silently clamping to the established simulator’s legacy 180-entry limit.
- Budget allocation uses integer cents and conserves the exact total. A plan is blocked when its budget cannot allocate at least one cent per intended purchase.
- Recent volatility uses close-to-close realized log returns, square-root-of-time normalization, a plain category, and an actual typical-daily-swing measure. “Stable-like” is behavior language, not token classification or a peg guarantee.
- One seeded sample bootstraps centered historical return/wick shapes, scales them to the measured volatility, and anchors the first candle to the current pool quote. It is reproducible for the same token/data/inputs and explicitly marked illustrative, synthetic, and `forecast: false`.
- The new `ScheduledDcaChart` combines muted real-history context with bright illustrative candles and shows:
  - grouped green `B` markers for simulated scheduled purchases;
  - a moving weighted-average entry line;
  - a moving orange conditional target-close line;
  - a moving red conditional risk-review line;
  - an orange target or red review marker only if this sample reaches the corresponding close condition.
- Dense schedules are grouped into at most 48 visual buy markers without changing the exact schedule or arithmetic. An accessible buy table and clear `B×n` semantics preserve the underlying count.
- Average entry, target, and review levels recompute after every simulated buy. A qualifying sample close stops later simulated buys and preserves unused budget; it does not model or imply an executed sale, stop order, or guaranteed fill.
- The target is the chosen percentage above the running simulated average. The risk-review floor is one chosen-duration realized-volatility move below the running average, bounded to a 3%–90% buffer.
- Price is the source series. MCAP and FDV are implied using the provider’s current price-to-valuation ratio, carry a constant-ratio/supply disclosure, and fall back to Price when the requested valuation is unavailable.
- `ScheduledPlanSummary` gives one compact answer: buys and amount per buy, duration/cadence, volatility and illustrative range, target level, review level, and whether either level was reached in this sample.
- The share flow now exports scheduled-plan square/story cards with amount, cadence, duration, planned count, amount per buy, volatility, target, review, exact token/pool provenance, timestamps, and prominent simulation/not-forecast copy.
- Address, pool, amount, duration, frequency, target, value unit, and automatically selected evidence interval persist in the query string. Legacy `plan` and `touches` parameters are removed from new URLs.
- Pool selection, evidence metrics, methodology, warnings, safety limits, and modeling assumptions are consolidated under one collapsed technical-details section.
- The scheduled chart retains a visible TradingView copyright/link and accessible chart/buy descriptions.
- The established `/`, `/plan/<id>`, and `#p=` flows remain isolated from the lazy-loaded `/contract` redesign.

## Model boundaries

- Muted history candles are provider data. Bright future candles are one seeded volatility illustration, not historical data and not a forecast.
- The centered bootstrap does not preserve historical trend, return autocorrelation, or volatility clustering and does not span every possible tail outcome.
- `TARGET CLOSE` and `RISK REVIEW` are conditional simulation events. They stop later simulated buys only; neither executes or models a sale.
- Fees, gas, token taxes, slippage, price impact, failed transactions, changing liquidity, and supply changes are excluded.
- Market-data quality is not contract-security evidence. Honeypot, sellability, authority, holder, deployer, and LP-lock risk remain unknown.
- Price/MCAP/FDV projections must not be described as interchangeable. MCAP and FDV are implied only when their own provider values exist.

## Verification completed

- [x] `npm run lint` — zero warnings/errors
- [x] `npm test` — 100/100 tests pass
- [x] Scheduled-DCA tests cover all five cadences, exact end-exclusive counts, the 2,160-buy hourly/90-day case, exact-cent conservation, invalid/zero-cent schedules, deterministic seeds, finite extreme-price handling, moving target/review levels, target/review terminal events, stable-like caveats, valuation projections, and inherited market-data gates
- [x] Share-card tests cover scheduled-plan model normalization and render fallbacks
- [x] `npm run build`
- [x] `git diff --check`
- [x] The onchain browser smoke code now covers the simple source order, five cadences, Price/MCAP/FDV, amount/frequency/duration/target URL persistence, plan-card generation, 320px/390px layout checks, reload restoration, and rapid cadence changes
- [x] [PR #6](https://github.com/Cmvng/dca-simulator/pull/6) merged at `c957777e9ab9bc7a9963c8eb792ba7a5a54a3cfd`
- [x] Railway deployment `d82b8a50-10ec-43b6-8f35-f128bbdedf73` reached `SUCCESS`
- [x] Live STONK acceptance confirmed the resolved token and volatility, all four plan inputs, all five cadence choices, one scheduled chart, Price/MCAP/FDV modes, grouped `B` markers, moving average entry, target-close and risk-review references, compact summary, plan-card section, and collapsed technical disclosure
- [x] Live reload preserved amount `$123.45`, 6-hour cadence, 7-day duration, 50% target, derived `1H` evidence interval, and 28 scheduled buys
- [x] Price, FDV, and MCAP selections persisted; card generation produced the STONK scheduled-DCA PNG preview with **Download PNG** and **Copy live link** actions
- [x] Live console review exposed Lightweight Charts `unexpected base`; [PR #7](https://github.com/Cmvng/dca-simulator/pull/7) fixed it with an explicit `1e18` price-format base and added a smoke regression
- [x] PR #7 merged at `dd24717efac45163e78aa8ae17aac4fb1e11fd05`; Railway deployment `a5d32f46-606d-4fec-bcc6-e2ee49b9e284` reached `SUCCESS`
- [x] Fresh-tab retesting of Price, FDV, and MCAP produced zero app-origin console errors; the root route also loaded with zero app-origin errors
- [ ] Local browser smoke execution — code is ready, but this environment has no usable Chromium binary. Equivalent deployed-flow acceptance passed in a live browser

## Known gaps after release

- Run the updated contract smoke in an environment with Chromium and inspect the 320px/390px screenshots.
- Review the seeded-sample copy and chart visually on both a stable-like token and another extreme-volatility memecoin.
- The contract route still has no honeypot/sellability/tax/authority/holder/LP scan and no executable buy/sell quote.
- Arbitrary-address endpoints still need per-IP throttling, in-flight request coalescing, and stronger shared caching before public scale.
- Cross-pool and cross-provider quote divergence are not yet blocking rules.
- A single seeded sample is not a success rate or probability. No predictive confidence, win rate, or expected return should be published without strict out-of-sample validation.

## Next handoff

1. Run `npm run smoke:onchain` with a supported Chromium binary and resolve any visual/runtime failures.
2. Extend production acceptance to a stable-like token plus 7-day and 90-day boundary schedules.
3. Keep the P0 security and executable-quote integrations in `docs/RECOMMENDATIONS.md` as requirements before any trade-ready CTA.
4. Treat the old B1–B4 price-zone profiles only as a separately labelled future advanced mode, never as part of the primary scheduled-DCA result.
