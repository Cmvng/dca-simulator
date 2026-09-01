// Unit tests for the client-side cache layer. Hermetic: localStorage and
// fetch are process-local stubs (node --test runs each file in its own
// process, so other test files never see them). The module reads both
// globals at call time, not import time.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => { store.clear(); },
};

let fetchCalls = [];
let fetchBody = null;
globalThis.fetch = async url => {
  fetchCalls.push(String(url));
  if (fetchBody === null) throw new Error("unexpected fetch: " + url);
  return { ok: true, status: 200, json: async () => fetchBody };
};

const { getCoins, getHistory, getLivePrice } = await import("./api.js");

const put = (key, d, t = Date.now()) =>
  store.set("cmv_" + key, JSON.stringify({ d, t }));

beforeEach(() => {
  store.clear();
  fetchCalls = [];
  fetchBody = null;
});

test("getCoins: legacy bare-array cache is served without fetching", async () => {
  const coins = [{ id: "bitcoin" }, { id: "ethereum" }];
  const t = Date.now() - 1000;
  put("coins250", coins, t);
  const res = await getCoins();
  assert.deepEqual(res.data, coins);
  assert.equal(res.fetchedAt, t);
  assert.equal(res.stale, false);
  assert.equal(fetchCalls.length, 0);
});

test("getCoins: v2 cache shape is served and preserves fetchedAt", async () => {
  const coins = [{ id: "bitcoin" }];
  put("coins250", { coins, fetchedAt: 12345 });
  const res = await getCoins();
  assert.deepEqual(res.data, coins);
  assert.equal(res.fetchedAt, 12345);
  assert.equal(res.stale, false);
  assert.equal(fetchCalls.length, 0);
});

test("getCoins: garbage cache entry falls through to fetch; bare-array response body is normalized", async () => {
  put("coins250", { wrong: "shape" });
  fetchBody = [{ id: "solana" }];
  const res = await getCoins();
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(res.data, [{ id: "solana" }]);
  assert.equal(res.stale, false);
  assert.ok(Number.isFinite(res.fetchedAt));
  // the rewritten cache entry must be the v2 shape
  const rec = JSON.parse(store.get("cmv_coins250"));
  assert.deepEqual(rec.d.coins, [{ id: "solana" }]);
});

test("getCoins: empty-array cache entry is a miss", async () => {
  put("coins250", []);
  fetchBody = { coins: [{ id: "bitcoin" }], fetchedAt: 777 };
  const res = await getCoins();
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(res.data, [{ id: "bitcoin" }]);
  assert.equal(res.fetchedAt, 777);
});

test("getHistory: cache entry without a prices array is a miss", async () => {
  put("h_btc", [[1, 2]]);
  fetchBody = { prices: [[1, 2], [3, 4]], fetchedAt: 555 };
  const res = await getHistory("btc");
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(res.data.prices, [[1, 2], [3, 4]]);
  assert.equal(res.fetchedAt, 555);
});

test("getHistory: well-formed cache entry is served without fetching", async () => {
  put("h_btc", { prices: [[1, 2]], fetchedAt: 42 });
  const res = await getHistory("btc");
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(res.data.prices, [[1, 2]]);
  assert.equal(res.fetchedAt, 42);
});

test("getLivePrice: cache entry with a non-finite price is a miss", async () => {
  put("lp_btc", { price: null, change24h: 0 });
  fetchBody = { data: { btc: { usd: 42, usd_24h_change: 1.5 } }, fetchedAt: 999 };
  const res = await getLivePrice("btc");
  assert.equal(fetchCalls.length, 1);
  assert.equal(res.data.price, 42);
  assert.equal(res.data.change24h, 1.5);
  assert.equal(res.fetchedAt, 999);
});

test("getLivePrice: finite cached price is served without fetching", async () => {
  put("lp_btc", { price: 7, change24h: -2 });
  const res = await getLivePrice("btc");
  assert.equal(fetchCalls.length, 0);
  assert.equal(res.data.price, 7);
  assert.equal(res.stale, false);
});
