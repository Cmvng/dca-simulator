import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import tokenHandler from "../api/token.js";
import candlesHandler from "../api/candles.js";

const ORIGINAL_FETCH = globalThis.fetch;
const TOKEN = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const FUZZY = "0x3333333333333333333333333333333333333333";
const POOL_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const POOL_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const POOL_C = "0xcccccccccccccccccccccccccccccccccccccccc";

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function resource(address, name, symbol) {
  return {
    id: `eth_${address}`,
    type: "token",
    attributes: { address, name, symbol, decimals: 18 },
  };
}

const INCLUDED = [
  resource(TOKEN, "Meme", "MEME"),
  resource(OTHER, "Wrapped Ether", "WETH"),
  resource(FUZZY, "Meme Copy", "MEME"),
  { id: "test_dex", type: "dex", attributes: { name: "Test DEX" } },
];

function pool({ address, tokenAddress = TOKEN, tokenSide = "base", liquidity = 1_000, volume = 100 }) {
  const counterparty = tokenAddress === OTHER ? TOKEN : OTHER;
  const baseAddress = tokenSide === "base" ? tokenAddress : counterparty;
  const quoteAddress = tokenSide === "quote" ? tokenAddress : counterparty;
  return {
    id: `eth_${address}`,
    type: "pool",
    attributes: {
      address,
      base_token_price_usd: "2",
      quote_token_price_usd: "0.5",
      reserve_in_usd: String(liquidity),
      volume_usd: { h24: String(volume) },
      market_cap_usd: "900000",
      fdv_usd: "1200000",
      price_change_percentage: { h24: "12.5" },
      transactions: { h24: { buys: 8, sells: 4, buyers: 7, sellers: 4 } },
    },
    relationships: {
      base_token: { data: { id: `eth_${baseAddress}`, type: "token" } },
      quote_token: { data: { id: `eth_${quoteAddress}`, type: "token" } },
      dex: { data: { id: "test_dex", type: "dex" } },
    },
  };
}

test("token route discards fuzzy matches and selects the exact strongest pool in one request", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      data: [
        pool({ address: POOL_A, tokenAddress: FUZZY, liquidity: 9_000_000, volume: 9_000_000 }),
        pool({ address: POOL_B, liquidity: 10_000, volume: 100 }),
        pool({ address: POOL_C, liquidity: 10_000, volume: 250 }),
      ],
      included: INCLUDED,
    });
  };

  const response = await tokenHandler(new Request(`https://app.test/api/token?address=${TOKEN}`));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(body.asset.poolAddress, POOL_C);
  assert.equal(body.asset.token.address, TOKEN);
  assert.deepEqual(body.alternatives.map(item => item.poolAddress), [POOL_B]);
});

test("generic quote-side pool fields do not masquerade as token metrics", async () => {
  globalThis.fetch = async () => Response.json({
    data: [pool({ address: POOL_A, tokenSide: "quote", liquidity: 5_000 })],
    included: INCLUDED,
  });

  const response = await tokenHandler(new Request(`https://app.test/api/token?address=${TOKEN}`));
  const { asset } = await response.json();

  assert.equal(response.status, 200);
  assert.equal(asset.tokenSide, "quote");
  assert.equal(asset.market.priceUsd, 0.5);
  assert.equal(asset.market.marketCapUsd, null);
  assert.equal(asset.market.fdvUsd, null);
  assert.equal(asset.market.change24h, null);
  assert.equal(asset.counterToken.address, OTHER);
  assert.equal(asset.counterToken.symbol, "WETH");
});

test("missing transaction counts remain unavailable instead of becoming zero", async () => {
  const payloadPool = pool({ address: POOL_A, liquidity: 5_000 });
  delete payloadPool.attributes.transactions;
  globalThis.fetch = async () => Response.json({ data: [payloadPool], included: INCLUDED });

  const response = await tokenHandler(new Request(`https://app.test/api/token?address=${TOKEN}`));
  const { asset } = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(asset.market.transactions24h, {
    buys: null,
    sells: null,
    buyers: null,
    sellers: null,
  });
});

test("candle route enforces token orientation and returns sorted unique valid OHLCV", async () => {
  let requestedUrl;
  globalThis.fetch = async url => {
    requestedUrl = new URL(url);
    return Response.json({
      data: { attributes: { ohlcv_list: [
        [300, "3", "4", "2", "3.5", "8"],
        [100, "1", "2", "0.5", "1.5", "4"],
        [100, "9", "10", "8", "9", "2"],
        [200, "2", "3", "1", "2.5", "0"],
        [400, "0", "1", "0", "0", "0"],
        [500, "2", "1", "3", "2", "1"],
      ] } },
      meta: { base: { address: OTHER }, quote: { address: TOKEN } },
    });
  };

  const url = `https://app.test/api/candles?network=eth&pool=${POOL_A}&token=${TOKEN}&timeframe=hour&aggregate=4&limit=100`;
  const response = await candlesHandler(new Request(url));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requestedUrl.searchParams.get("token"), TOKEN);
  assert.deepEqual(body.candles.map(item => item.time), [100, 200, 300]);
  assert.equal(body.candles[0].open, 1);
  assert.equal(body.candles[1].volume, 0);

  const wrongToken = await candlesHandler(new Request(url.replace(TOKEN, FUZZY)));
  assert.equal(wrongToken.status, 422);
  assert.equal((await wrongToken.json()).error.code, "TOKEN_NOT_IN_POOL");
});

test("invalid route parameters fail before contacting GeckoTerminal", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("fetch should not run");
  };

  const badAddress = await tokenHandler(new Request("https://app.test/api/token?address=bad/value"));
  assert.equal(badAddress.status, 400);
  assert.equal((await badAddress.json()).error.code, "INVALID_ADDRESS");

  const badAggregate = await candlesHandler(new Request(
    `https://app.test/api/candles?network=eth&pool=${POOL_A}&token=${TOKEN}&timeframe=minute&aggregate=4`,
  ));
  assert.equal(badAggregate.status, 400);
  assert.equal((await badAggregate.json()).error.code, "INVALID_AGGREGATE");
  assert.equal(calls, 0);
});

test("upstream rate limits retain a useful normalized error and retry delay", async () => {
  globalThis.fetch = async () => Response.json(
    { errors: [{ detail: "Slow down" }] },
    { status: 429, headers: { "Retry-After": "17" } },
  );

  const response = await tokenHandler(new Request(`https://app.test/api/token?address=${TOKEN}`));
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.deepEqual(body.error, { code: "UPSTREAM_RATE_LIMITED", message: "Slow down" });
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
