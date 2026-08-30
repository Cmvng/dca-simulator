# Recommendations

Priorities use P0 (required before any trade-ready or actionable CTA), P1 (high-value next), and P2 (later expansion).

## Delivered baseline

- [x] Exact-address contract resolution, explicit pool identity, and real pool OHLCV.
- [x] Blocking states for no pool, too little history, and critically low liquidity.
- [x] Separate market-data checks and unknown smart-contract-security status.
- [x] Request cancellation so stale responses cannot replace the latest token.
- [x] Cache policy by data type and readable upstream/rate-limit errors.
- [x] Deterministic tests for normalization, pool choice, ATR, zones, weighted entry, and gates.
- [x] TradingView Lightweight Charts attribution.
- [x] User-selectable alternative exact pools and explicit counter-token identity.
- [x] Duration-aware confidence, short-window reference mode, and accessible chart summaries/tables.
- [x] Three visible price-zone profiles with distinct allocation/spacing and explicit non-suitability language.
- [x] Budget, 7–90 day monitoring duration, volatility-scaled/custom target, downside context, and prefix/all-fill outcomes.
- [x] Price / Market Cap / FDV chart and level views with constant-supply-ratio disclosure and no missing-value substitution.
- [x] Planned B1–B4/S1/X1 rail plus optional, explicitly retrospective in-sample touch markers.
- [x] Contract-token X, square, and story share cards with pool/DEX/counter provenance and `PLANNED · NOT EXECUTED` labeling.
- [x] Full contract-plan URL state for address, pool, interval, amount, duration, profile, unit, target, and touch visibility.
- [x] Main simulator chart annotations that distinguish modeled purchases, a conditional target crossing, and the modeled low-water point.
- [x] Contract Plan Studio v2 shipped through PR #4 at merge commit `98254613638e5b2c919e7fb3018053a83a261ef7`; Railway deployment `abdd60fe-b704-4093-aa81-1aafdcb18e7a` reached `SUCCESS`.
- [x] Live production acceptance passed with STONK on the exact selected Meteora pool, 26 `1D` candles, all three profiles, Price/MCAP/FDV, `B1`–`B4`/`S1`/`X1`, reload-persistent URL state, card generation, main-chart annotations, and no app-origin console errors.

## P0 — before any trade-ready CTA

- Add GoPlus plus an independent sell-simulation source; hard-block known honeypot, unsellable, malicious-authority, and extreme-tax results.
- Request size-aware buy and sell quotes for the largest proposed tranche; block or split plans with severe impact.
- Add per-IP throttling and in-flight request coalescing for arbitrary-address endpoints.
- Compare the top eligible pools and make large cross-pool price divergence watch-only or blocked.
- Make large cross-provider quote divergence watch-only or blocked once an independent quote source is connected.

## P1 — product quality

- Add saved/watchlisted contract plans in a database, with a durable evidence snapshot and explicit stale-plan state.
- Add alerts when a planned zone is reached, an interval closes below X1, liquidity falls sharply, or contract-security evidence changes.
- Add a fixed higher-timeframe evidence option so changing the viewing interval need not change a long-horizon ladder.
- Add a compact provider-window disclosure with the actual first/last candle timestamps.
- Build rolling or prefix out-of-sample backtests before publishing any plan success rate, hit probability, or confidence phrased as predictive. Compare with equal-time DCA and lump-sum baselines, and preserve a strict split between plan construction and evaluation candles.
- Add genuinely different time-scheduled and hybrid DCA plan types. Keep them separate from the three existing price-zone profiles and label their execution assumptions independently.

## P2 — advanced intelligence

- Holder concentration and wallet-cluster analysis from a dedicated onchain provider.
- Liquidity-lock/burn evidence and deployer-history signals.
- Multi-pool aggregation only after robust outlier and manipulated-pool handling.
- Optional authenticated portfolio tracking; no trade execution until legal, security, and transaction-simulation work is complete.

## Provider strategy

Use a provider adapter so the product can start keyless and graduate without a UI rewrite:

| Role | Recommended provider | Product use |
|---|---|---|
| Keyless MVP | [GeckoTerminal/CoinGecko Onchain](https://docs.coingecko.com/reference/pool-ohlcv-contract-address) | Exact-pool discovery and real OHLCV. A single request is provider-window-limited, so the UI must report the actual returned span and avoid implying all-time history. |
| Production market data | [CoinGecko Onchain paid](https://docs.coingecko.com/changelog) or [Birdeye OHLCV V3](https://docs.birdeye.so/reference/get-defi-v3-ohlcv) | Higher operating limits and a provider abstraction suitable for production traffic; evaluate supported chains, latency, history, and cost before choosing. |
| Contract risk | [GoPlus token-security data](https://docs.gopluslabs.io/reference/response-details) | Honeypot, buy/sell restriction, tax, blacklist, transfer-pause, and authority signals. Treat missing fields as unknown, not safe. |
| Independent snapshot | [DEX Screener API](https://docs.dexscreener.com/api/reference) | Cross-check pair discovery, liquidity, and current market snapshots. Its documented pair/token endpoints are not the primary historical-candle source. |
| Execution reality | Chain-specific executable buy/sell quote API | Test the largest proposed tranche for route availability, taxes, price impact, slippage, and gas before showing an actionable ladder. |
| Holder intelligence | Dedicated holder/RPC provider | Add only when concentration and wallet-cluster analysis becomes a committed feature. |

## Non-goals for this milestone

- Executing swaps or custodying funds.
- Claiming a token is safe because liquidity looks healthy.
- Predicting future candles.
- Showing holder P&L lists copied from the visual reference.
