# Recommendations

Priorities use P0 (required before any trade-ready CTA), P1 (high-value product quality), and P2 (later expansion).

## Delivered baseline

- [x] Exact-address contract resolution, canonical token identity, explicit pool identity, alternative exact-pool selection, and real pool OHLCV.
- [x] Blocking states for missing pools, insufficient or stale history, critically low liquidity, poor candle density, and large quote/candle divergence.
- [x] Separate market-data quality checks and an explicit unknown smart-contract-security state.
- [x] Request cancellation and stale-response protection so an older lookup cannot replace the latest token.
- [x] Cache policy by data type plus readable upstream and rate-limit errors.
- [x] One primary scheduled-DCA flow: contract address -> volatility -> amount/frequency/duration/target -> one chart -> plain summary -> share card.
- [x] Five buy cadences: every hour, every 6 hours, every 12 hours, every day, and every week.
- [x] Whole-day durations from 7 through 90 days with automatic evidence resolution.
- [x] Exact, end-exclusive schedule generation with the first buy at the start, no hidden purchase-count cap, and all 2,160 intended buys for a 90-day hourly plan.
- [x] Integer-cent allocation that conserves the exact budget and blocks plans that cannot allocate at least one cent to every intended purchase.
- [x] Realized close-to-close volatility with a plain category and measured typical-daily-swing explanation.
- [x] One deterministic seeded sample that is explicitly synthetic, illustrative, and `forecast: false`; it is not presented as a prediction, probability, or expected return.
- [x] One Fomo-style chart with muted real-history context, bright illustrative candles, grouped `B` markers, moving average-entry, conditional target-close, and conditional risk-review levels.
- [x] Price, implied MCAP, and implied FDV views with constant-ratio and supply caveats plus Price fallback when valuation data is unavailable.
- [x] A compact scheduled-plan summary and square/story share cards with token/pool provenance, planned amount, cadence, duration, purchase count, volatility, target, review, timestamps, and prominent simulation copy.
- [x] Query-string restoration for address, pool, amount, duration, frequency, target, value unit, and automatic evidence interval.
- [x] Collapsed technical details, accessible chart/buy descriptions, and visible TradingView attribution.
- [x] Deterministic model, market-data, share-card, and integration coverage; 100 tests, lint, and production build pass.
- [x] Updated browser-smoke code for the simple flow, five cadences, Price/MCAP/FDV, query restoration, card generation, rapid changes, and 320px/390px layouts. Local execution remains pending because this environment has no usable Chromium binary.
- [x] [PR #6](https://github.com/Cmvng/dca-simulator/pull/6) merged at `c957777e9ab9bc7a9963c8eb792ba7a5a54a3cfd`; Railway deployment `d82b8a50-10ec-43b6-8f35-f128bbdedf73` reached `SUCCESS` at [web-production-84b5c.up.railway.app](https://web-production-84b5c.up.railway.app).
- [x] Full lint, 100/100 tests, production build, and diff check passed. Live STONK acceptance confirmed token/volatility, four inputs, all five cadence choices, one chart, Price/MCAP/FDV, `B` markers, moving average entry, target close, risk review, summary, plan-card section, and collapsed disclosure.
- [x] Live reload preserved `$123.45`, every 6 hours, 7 days, a 50% target, derived `1H` evidence, and 28 buys. Price/FDV/MCAP selections persisted, and card generation produced the STONK scheduled-DCA PNG preview with **Download PNG** and **Copy live link**.
- [x] Live console review found Lightweight Charts `unexpected base`; [PR #7](https://github.com/Cmvng/dca-simulator/pull/7) fixed it with an explicit `1e18` price-format base plus a smoke regression and merged at `dd24717efac45163e78aa8ae17aac4fb1e11fd05`. Railway deployment `a5d32f46-606d-4fec-bcc6-e2ee49b9e284` reached `SUCCESS`.
- [x] Fresh-tab Price, FDV, and MCAP retests had zero app-origin console errors. The root route also loaded with zero app-origin errors.

The earlier `B1`-`B4` pullback-zone profiles are historical work, not part of the primary scheduled-DCA result. Keep them only as a separately labelled future advanced mode if user research proves they add value without restoring the previous complexity.

## Post-release verification status

- Equivalent deployed-flow browser acceptance passed. Local `npm run smoke:onchain` execution remains unavailable because this environment has no usable Chromium binary; run it in CI or another supported environment and inspect the 320px and 390px screenshots when available.
- Test at least one stable-like asset and one extreme-volatility memecoin across short and long schedules.
- Exercise the remaining cadences plus 7-day and 90-day boundaries, alternative-pool selection, and the story card format.
- Add automated 320px/390px visual regression when browser execution is available in CI.

## P0 — launch integrity before a trade-ready CTA

- Add GoPlus plus an independent sell-simulation source; hard-block known honeypot, unsellable, malicious-authority, transfer-restricted, blacklist, and extreme-tax results. Missing data must remain **unknown**, never “safe.”
- Request executable, size-aware buy and sell quotes for the actual per-buy amount and the largest scheduled purchase. Report route availability, minimum order constraints, token taxes, slippage, price impact, gas, and expected received amount; block or split impractical plans.
- Keep a persistent disclosure that chart buys and exit/review levels are simulations, not orders, fills, or financial advice. Do not add a “Buy” CTA until quote, contract-risk, legal, and transaction-simulation gates exist.
- Add per-IP throttling, abuse controls, in-flight request coalescing, and stronger shared caching for arbitrary-address endpoints.
- Compare eligible exact pools and make large cross-pool price divergence watch-only or blocked.
- Add an independent live quote source and make large cross-provider divergence watch-only or blocked.

## P1 — product quality

- Let the user choose an explicit UTC or local start time. The current simulation starts from the data-derived timestamp, which is adequate for an illustration but not for a saved schedule.
- Save/watchlist scheduled plans with the evidence timestamp, chosen pool, model version, seed, and inputs. Mark them stale when the pool, risk state, liquidity, or market evidence changes materially.
- Make shared-plan reproduction durable. Persist the evidence snapshot or an immutable reference plus the seed/model version; input-derived seeding alone cannot guarantee the same picture after provider candles update.
- Add alerts for the next planned buy time, target/review proximity, liquidity deterioration, or security-state changes. Alerts should never imply automatic execution.
- Add a compact provider-window disclosure with actual first/last candle timestamps and explain when the provider returned less history than the selected duration.
- Model fees, gas, taxes, slippage, failed transactions, and price impact from executable quotes before showing net accumulation or net target outcomes.
- Validate the illustration with many seeds and strict out-of-sample backtests before adding ranges, success rates, probabilities, or “expected” outcomes. Never infer confidence from the one displayed seed.
- Add automated visual-regression coverage for the contract flow and both card formats once browser execution is available in CI.
- If retained, expose the legacy `B1`-`B4` zone ladder only behind a clearly named Advanced strategy view with separate methodology and warnings; never mix it into the primary scheduled plan.

## P2 — advanced intelligence

- Holder concentration and wallet-cluster analysis from a dedicated onchain provider.
- Liquidity-lock/burn evidence, deployer history, mint/freeze/upgrade authority analysis, and material authority-change alerts.
- Backtests that compare scheduled DCA with equal-time DCA variants and lump-sum baselines without presenting hindsight performance as a forecast.
- Multi-pool aggregation only after robust manipulated-pool, outlier, and token-identity handling.
- Optional authenticated portfolio tracking. Defer custody and automated trade execution until legal, security, signing, recovery, monitoring, and transaction-simulation work is complete.

## Provider strategy

Keep the provider adapter so the product can start keyless and graduate without a UI rewrite:

| Role | Recommended provider | Product use |
|---|---|---|
| Keyless MVP | [GeckoTerminal/CoinGecko Onchain](https://docs.coingecko.com/reference/pool-ohlcv-contract-address) | Exact-pool discovery and real OHLCV. A single request is provider-window-limited, so report the actual returned span and never imply all-time history. |
| Production market data | [CoinGecko Onchain paid](https://docs.coingecko.com/changelog) or [Birdeye OHLCV V3](https://docs.birdeye.so/reference/get-defi-v3-ohlcv) | Higher operating limits and deeper history behind the existing adapter. Evaluate chain coverage, latency, retention, and cost before choosing. |
| Contract risk | [GoPlus token-security data](https://docs.gopluslabs.io/reference/response-details) | Honeypot, buy/sell restriction, tax, blacklist, transfer-pause, and authority signals. Treat missing fields as unknown. |
| Independent snapshot | [DEX Screener API](https://docs.dexscreener.com/api/reference) | Cross-check pair discovery, liquidity, and current market snapshots. Do not use its snapshot endpoints as the primary historical-candle source. |
| Execution reality | Chain-specific executable buy/sell quote API | Test each schedule's real per-buy size and largest purchase for routes, taxes, impact, slippage, gas, and minimums before showing an actionable plan. |
| Holder intelligence | Dedicated holder/RPC provider | Add only when concentration and wallet-cluster analysis is a committed feature. |

## Non-goals for this milestone

- Executing swaps, automating buys, or custodying funds.
- Claiming a token is safe because market data or liquidity looks healthy.
- Presenting the bright seeded path as a forecast, prediction, expected return, probability, or complete risk distribution.
- Treating MCAP, FDV, and price as interchangeable; valuation views remain implied from current provider ratios.
- Copying holder P&L lists or trading-app social features from the visual reference.
- Returning the legacy `B1`-`B4` zone ladder to the primary contract flow.
