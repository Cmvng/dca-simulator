# CHECKPOINT — CMVNG DCA Simulator

> Current working state. Update this file at the end of each implementation session.

**Date:** 2026-08-30
**Branch:** `feat/cmvng-v2-upgrade` (Railway-tracked)
**Execution-map merge:** `ba5b621` from [PR #2](https://github.com/Cmvng/dca-simulator/pull/2)
**Analyzer foundation:** `3e67f2f` from [PR #1](https://github.com/Cmvng/dca-simulator/pull/1)
**Core model:** CMVNG Simulation v3.0.0, unchanged
**New methodology:** Onchain ladder v1, isolated from the behavior-locked core model

## Outcome

The contract-address milestone and execution-map follow-up are merged and live on the Railway production service. The release closes the short-history dead end and makes the complete conditional execution plan visible beside the main chart. The established planner remains the default at `/`; public `/plan/<id>` pages and `#p=` shares are preserved. The analyzer remains lazy-loaded only at `/contract`.

## Delivered

- Exact contract or mint search with fuzzy matches discarded.
- Automatic network discovery and deterministic liquidity-first pool selection, with volume as a tiebreaker.
- Alternative exact-match pool/network selector with correct token-side and counter-token identity.
- Validated, token-oriented GeckoTerminal OHLCV for 5m, 15m, 1h, 4h, and 1d. The duplicate MAX control was removed because it issued the same daily request as 1d.
- Fomo-inspired dark navy candlestick/volume chart inside the CLEAR BLUE shell.
- Shaded `B1`–`B4` buy bands plus current, simulated average, `S1` goal, and invalidation/scenario-floor references; Fit includes off-candle plan levels.
- A complete chart-adjacent execution map with each allocation and price range, trigger sequence, target, invalidation, and selectable plan-review window.
- Explicit execution semantics: buys are conditional price triggers that may never fill; `S1` applies after fills; the review date is a reassessment deadline rather than a price prediction.
- Crosshair OHLCV, mobile gestures, visible TradingView attribution, concise screen-reader summary, level table, and a capped recent-candle table.
- Deterministic four-tranche price-triggered ladder with true-range ATR and repeated swing-low clustering.
- Explicit tiers: a volatility-reference plan needs at least 20 candles and 24 elapsed hours; adaptive structural mode additionally needs at least 30 candles, seven days, and two repeated zones.
- Requested-interval density and latest-candle freshness gates prevent sparse or dead-pool bars from masquerading as live evidence.
- Short daily histories such as 26 candles now receive a conservative four-leg volatility-reference plan instead of a misleading structural claim or a dead end.
- Duration-aware confidence: intraday candle counts cannot masquerade as months of evidence.
- Blocking gates for price, candle count/duration, liquidity, and extreme quote/candle divergence; volume, age, and volatility feed warnings/confidence scoring.
- Exact goal-from-average arithmetic and an explicit warning when live price already exceeds the chosen goal.
- Honest security gap: market-data confidence is never presented as contract safety.
- Monotonic request IDs plus synchronous cancellation prevent stale token/candle responses; contract, exact pool, and interval persist in the URL across refreshes.
- Every budget cent is assigned deterministically across B1–B4, and neighboring price bands are capped so trigger ranges cannot overlap.
- Same-origin Vite, standalone Railway, and Vercel-compatible API handlers for coins, tokens, and candles.
- Dedicated mocked contract browser smoke covering success, alternate pools, timeframe errors, stale-result removal, chart canvas, four plan legs, and 320/390px overflow.
- Mobile information hierarchy is chart-first in both visual and DOM order, with all six market metrics displayed in a compact grid instead of a cue-less horizontal scroller.

## Verification completed

- [x] `npm ci`
- [x] `npm run lint` — zero warnings/errors
- [x] `npm test` — 61/61 pass, including the v3 behavior lock, short-history tiers, cent conservation, non-overlap, sparse-history, and stale-candle regressions
- [x] `npm run build`
- [x] Default planner remains a 75.63 kB gzip entry; contract code is a separate lazy 73.85 kB gzip chunk plus 4.40 kB CSS
- [x] Vite: `/` and `/contract` return the SPA; parameterless token/candle GETs return structured 400 JSON; OPTIONS returns 204
- [x] Standalone server: health, root, contract SPA fallback, token/candle 400 JSON, and OPTIONS 204 all pass
- [x] Live Solana WIF: exact pool resolution and 300 chronological 4-hour candles
- [x] Standalone cache-method regression: a live WIF GET returned 200, then the identical URL returned OPTIONS 204 and POST 405 rather than replaying cached GET data
- [x] Live Ethereum PEPE: exact Uniswap V2 pool, eight alternatives, and 120 chronological 4-hour candles
- [x] `git diff --check`, conflict-marker scan, and browser-script syntax checks
- [x] GitHub Actions, Vercel preview, code review, and security review passed
- [x] PR #1 squash-merged into `feat/cmvng-v2-upgrade` at `3e67f2f`; Railway auto-deployed the new bundle
- [x] Live Railway `/contract`: Ethereum PEPE resolved to the exact Uniswap V2 pool, loaded 500 chronological 4-hour candles, and rendered four DCA legs, weighted entry, goal, and invalidation
- [x] Live Railway `/`: established planner still renders and exposes the Contract navigation link
- [x] PR #2 squash-merged into `feat/cmvng-v2-upgrade` at `ba5b621`; Railway deployment `166f7b38-2830-4aee-8f7b-e4575379e1a4` reached `SUCCESS`
- [x] Live Railway STONK regression: the exact Meteora pool restored from the URL, 26 daily candles produced a volatility-reference plan, and the main chart rendered `B1`–`B4`, `S1`, and `X1`
- [x] Live acceptance: five distinct timeframes, six market metrics, six execution-map actions, exact-pool/interval reload persistence, `$500.50` decimal-budget preservation, and zero app-origin console errors

## Verification blocked by this workspace

- [ ] `npm run smoke`, `npm run smoke:onchain`, and `npm run e2e:plans` could not launch because the configured Chromium executable is absent from this runtime. The harnesses now accept `CHROME_PATH`; no browser assertion ran here.
- [x] Live desktop screenshots captured for the populated STONK chart and complete execution map.
- [ ] Review the dedicated harness screenshots at 390px and 320px once Chromium is available.

## Known launch gaps

- No honeypot, sellability, tax, authority, holder-concentration, deployer-history, or LP lock/burn scan yet.
- No executable buy-and-sell quotes, so route liquidity, price impact, taxes, gas, and slippage remain unknown.
- Arbitrary-address endpoints still need per-IP throttling and in-flight request coalescing before public scale.
- Cross-pool price divergence is displayed through pool choice but is not yet a blocking risk rule.
- GeckoTerminal's public beta allowance is small and variable; production traffic needs stronger shared caching or a paid onchain tier.
- “Any memecoin” means an exact token indexed on a supported network with an active pool, usable USD OHLCV, at least 20 reasonably dense and fresh candles spanning 24 hours, and acceptable market-data gates—not every chain, bonding curve, or newly created mint.

## Next handoff

1. Run all three browser harnesses with a valid `CHROME_PATH` and inspect the 390px/320px screenshots.
2. Treat the P0 items in `docs/RECOMMENDATIONS.md` as launch requirements, especially security and executable-quote providers before presenting the ladder as trade-ready.
3. Add executable buy/sell quotes and contract-risk providers before enabling any trade-ready CTA.
