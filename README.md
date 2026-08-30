# CMVNG DCA Simulator

A crypto DCA **decision engine** with two product modes:

- **Contract analyzer** — paste an indexed token contract or mint address, load its exact pool and real OHLCV candles, then map risk-aware DCA zones.
- **Top 250 simulator** — build, stress-test, backtest, compare, save, and share a DCA plan for established CoinGecko assets.

> This is a scenario simulator, not a prediction or a token-safety certificate. Historical data is evidence for stress-testing — never a forecast. Not financial advice · DYOR.

## Features

### Contract analyzer

- Exact contract/mint matching against GeckoTerminal pool relationships; fuzzy name and symbol matches are discarded.
- Automatic network discovery and deterministic highest-liquidity pool selection, with volume as a tiebreaker.
- A pool/network selector for alternative exact matches.
- Pool-specific USD OHLCV at 5-minute, 15-minute, 1-hour, 4-hour, and daily intervals.
- TradingView Lightweight Charts candlesticks and volume with shaded `B1`–`B4` buy bands, a weighted-entry reference, `S1` goal marker, and structural invalidation or scenario-floor line.
- Four deterministic DCA zones derived from historical swing-low evidence where available and clearly labelled ATR spacing otherwise.
- A chart-adjacent execution map with allocation, price range, trigger order, review window, and an explicit reminder that price triggers may never fill.
- Blocking gates for price, candle count/duration, interval density, candle freshness, liquidity, and extreme quote/candle divergence; volume, age, and volatility contribute warnings and confidence scoring.
- Adjustable budget and goal. Budget changes allocations and quantities, never the market-derived levels.
- Chart-first mobile layout with all six market metrics visible in a compact grid before plan controls.
- Request IDs plus cancellation prevent stale responses, while address/pool/interval URL state makes an analysis refreshable and shareable.

### Top 250 decision engine

- Top 250 assets with search, live prices, 365-day histories, and honest staleness labels.
- Scenario simulation, real historical backtests, rolling windows, and a seeded statistical mode.
- DCA vs hybrid vs lump sum, fees/slippage assumptions, drawdown, break-even, and reality checks.
- Saved/tracked plans, three share-card formats, and public plan links.
- Integer-cent money engine protected by behavior locks and a model version.

## Getting started

```bash
npm install
npm run dev        # Vite plus local /api middleware
npm test           # simulation, plan-store, DCA-engine, and onchain route tests
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

The browser harnesses use `CHROME_PATH` when Chromium is installed outside the default CI image path.

## Architecture

| Area | Files | Responsibility |
| --- | --- | --- |
| Product shell | `src/AppShell.jsx`, `src/main.jsx` | Keeps the established planner on `/` and lazy-loads contract analysis on `/contract`. |
| Contract UI | `src/components/OnchainAnalyzer.jsx` | Address resolution, pool selection, candles, timeframes, settings, risk states, and plan presentation. |
| Candlestick chart | `src/components/DcaChart.jsx` | Real OHLCV, volume, reference levels, responsive interactions, accessible data, and TradingView attribution. |
| Onchain engine | `src/lib/onchain/dcaEngine.js` | Candle normalization, true-range ATR, data gates, support clustering, zones, and plan arithmetic. |
| Onchain routes | `api/token.js`, `api/candles.js`, `api/_onchain.js` | Exact pool discovery, normalized OHLCV, validation, caching, and provider-error handling. |
| Established-asset app | `src/App.jsx`, `src/components/`, `src/hooks/` | Existing plan builder, results, retention, sharing, and public-plan experience. |
| Versioned simulator | `src/lib/simulation/` | Frozen, tested v3 numerical engine. The contract analyzer does not modify it. |
| Hosting | `vite.config.js`, `server.js`, `api/` | Local middleware, Railway Node server, and Vercel-compatible handlers. |

The contract flow is deterministic:

1. `/api/token` searches by address and discards every pool without an exact base/quote address match.
2. The strongest active pool is selected by liquidity, then volume; alternatives remain user-selectable.
3. `/api/candles` verifies that exact token belongs to the selected pool and returns validated chronological OHLCV.
4. The local engine either blocks weak data or calculates four descending scenario zones.
5. The chart draws only historical candles plus shaded buy bands and horizontal scenario references. It never draws fabricated future candles or a predicted price path.
6. `B1` through `B4` identify descending conditional buys; `S1` is the selected goal above simulated weighted average entry, not a promise or automatic order.

## What “supported” means

A token is supported only when GeckoTerminal indexes an exact matching active pool, returns a positive USD price and liquidity, confirms the token in the selected pool's OHLCV metadata, and supplies enough valid history. A conservative volatility-reference ladder requires at least 20 valid candles spanning 24 hours, reasonable coverage for the requested interval, a fresh latest candle, at least $10,000 reported pool liquidity, and no extreme live/candle divergence. Adaptive structural mode additionally requires at least 30 candles, seven elapsed days, and two repeated support zones. Anything that passes the base gate without all three structural requirements remains explicitly labelled a volatility-reference ladder.

This is deliberately narrower than “every memecoin.” A token can be unsupported because its network is not indexed, it is still on a bonding curve, no active pool exists, the public search does not return the pool, or history is too weak. Those cases produce an error or blocking state instead of invented levels.

Market cap and FDV remain separate. Missing market cap is shown as unverified, never replaced with FDV. Data confidence measures analysis usability, not the probability of profit.

## Provider limits

The keyless GeckoTerminal API is beta and rate-limited. Its newer [keyless API guide](https://docs.coingecko.com/docs/keyless-public-api) describes a dynamic allowance of roughly 10 calls per minute, while the older [GeckoTerminal FAQ](https://apiguide.geckoterminal.com/faq) still documents 30. Capacity planning should use the lower figure and treat `429` as ordinary provider backpressure.

One scan normally uses one pool-search request and one candle request. Search and OHLCV responses are cached; a paid CoinGecko Onchain tier or stronger shared caching is the natural production upgrade if usage outgrows the public allowance.

The chart exposes candle resolutions from 5 minutes through 1 day. The former `MAX` control was removed because it issued the same daily request as `1D` and implied a distinct all-time range that the provider does not supply. The UI reports the actual elapsed history returned.

## Safety limitations

- The contract milestone checks market-data quality; it is **not a smart-contract audit**.
- It does not yet detect honeypots, blocked selling, taxes, mutable mint/freeze permissions, blacklists, upgradeable proxies, transfer hooks, concentrated holders, deployer history, or LP lock/burn state.
- Reported liquidity and volume can be manipulated, fragmented, removed, or stale.
- No executable round-trip quote is requested yet, so displayed plans exclude real routing, price impact, taxes, gas, and slippage.
- ATR fallback levels are volatility references, not detected support or forecasts.
- `B1`–`B4`, `S1`, goal, and invalidation levels are conditional references, not guaranteed fills or executable orders. The review window is a prompt to reassess stale assumptions, not a forecast horizon. A memecoin can become unsellable or lose 100%.

GoPlus or another independent security provider, plus size-aware buy-and-sell quotes, should be added before presenting this as a launch-ready security screen.

## TradingView attribution

`lightweight-charts` renders the candles; GeckoTerminal supplies the market data. The chart includes a visible TradingView copyright notice and link in accordance with the [Lightweight Charts attribution guidance](https://tradingview.github.io/lightweight-charts/docs/5.0).

## Project documentation

- `DESIGN.md` — current Clear Blue product design law.
- `docs/CHECKPOINT.md` — current implementation and verification state.
- `docs/MEMORY.md` — durable product, architecture, and safety decisions.
- `docs/RECOMMENDATIONS.md` — prioritized follow-up work.
- `docs/PROJECT_OVERVIEW.md` — the established-asset v2/v3 architecture and methodology.
