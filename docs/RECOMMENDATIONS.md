# Recommendations

Priorities use P0 (required for trustworthy launch), P1 (high-value next), and P2 (later expansion).

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

## P0 — launch integrity

- Add GoPlus plus an independent sell-simulation source; hard-block known honeypot, unsellable, malicious-authority, and extreme-tax results.
- Request size-aware buy and sell quotes for the largest proposed tranche; block or split plans with severe impact.
- Add per-IP throttling and in-flight request coalescing for arbitrary-address endpoints.
- Compare the top eligible pools and make large cross-pool price divergence watch-only or blocked.
- Make large cross-provider quote divergence watch-only or blocked once an independent quote source is connected.

## P1 — product quality

- Add Price / Market Cap chart toggle for tiny-decimal tokens.
- Add saved/watchlisted plans in a database with alert thresholds.
- Add share cards for contract tokens with chain, pool, liquidity warning, and plan zones.
- Add a fixed higher-timeframe evidence option so changing the viewing interval need not change a long-horizon ladder.
- Add a compact provider-window disclosure with the actual first/last candle timestamps.

## P2 — advanced intelligence

- Holder concentration and wallet-cluster analysis from a dedicated onchain provider.
- Liquidity-lock/burn evidence and deployer-history signals.
- Alerts when a DCA zone is reached, liquidity falls sharply, or security state changes.
- Backtests that compare the displayed plan with equal-time DCA and lump-sum baselines.
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
