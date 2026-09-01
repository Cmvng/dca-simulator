// E2E for server.js.
//
// Part 1 — /api/plans wiring: spawns the real server as a child process
// (pattern: tools/plans-e2e.mjs — dist/ is not needed for /api/plans) and
// drives it with fetch over real HTTP. Proves the 413 path delivers an
// actual response instead of a connection reset, and that the owner token is
// honored ONLY via the x-cmvng-owner-token header.
//
// Part 2 — serveApi hardening: imports createApiServer in-process with
// globalThis.fetch stubbed for the GeckoTerminal origin, proving the per-IP
// rate limit on /api/token + /api/candles, the brief negative cache for
// non-200 responses, and the normalized cache key (param order/alias/hex-case
// variants share one cache entry and one upstream call).

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./server.js", import.meta.url));
const PORT = 4519; // plans-e2e uses 4517; keep clear of it
const BASE = `http://127.0.0.1:${PORT}`;

const VALID = {
  coinId: "bitcoin", capital: 500, freqId: "daily", months: 3, targetPct: 50,
  feePct: 0.5, feeFixed: 1, slippagePct: 0.2, hybridPct: 30, mode: "scenario",
};

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("server.js did not start listening");
}

function postPlan(config = VALID) {
  return fetch(`${BASE}/api/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

test("server.js /api/plans over real HTTP", async t => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), PLANS_DIR: mkdtempSync(join(tmpdir(), "cmvng-plans-srv-")) },
    stdio: "ignore",
  });
  try {
    await waitForServer();

    await t.test("oversized POST receives the 413 JSON, not a connection reset", async () => {
      const big = JSON.stringify({ ...VALID, pad: "x".repeat(20 * 1024) });
      const res = await fetch(`${BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: big,
      });
      assert.equal(res.status, 413);
      assert.equal(res.headers.get("connection"), "close");
      assert.deepEqual(await res.json(), { error: "Plan config too large." });
    });

    await t.test("POST → GET → DELETE lifecycle with the token header", async () => {
      const post = await postPlan();
      assert.equal(post.status, 201);
      const { id, ownerToken } = await post.json();
      assert.match(id, /^[a-z0-9]{8}$/);
      assert.match(ownerToken, /^[0-9a-f]{32}$/);

      const get = await fetch(`${BASE}/api/plans?id=${id}`);
      assert.equal(get.status, 200);
      assert.deepEqual((await get.json()).config, VALID);

      const del = await fetch(`${BASE}/api/plans?id=${id}`, {
        method: "DELETE",
        headers: { "x-cmvng-owner-token": ownerToken },
      });
      assert.equal(del.status, 200);
      assert.deepEqual(await del.json(), { revoked: true });

      const gone = await fetch(`${BASE}/api/plans?id=${id}`);
      assert.equal(gone.status, 404);
    });

    await t.test("DELETE with the token only in the query string → 404", async () => {
      const post = await postPlan({ ...VALID, coinId: "ethereum" });
      assert.equal(post.status, 201);
      const { id, ownerToken } = await post.json();

      const del = await fetch(`${BASE}/api/plans?id=${id}&token=${ownerToken}`, { method: "DELETE" });
      assert.equal(del.status, 404);

      const still = await fetch(`${BASE}/api/plans?id=${id}`);
      assert.equal(still.status, 200, "plan survives the query-string attempt");
    });
  } finally {
    child.kill();
  }
});

// ── Part 2: serveApi rate limit, negative cache, key normalization ───────────

const TOKEN_ADDR = "0x1111111111111111111111111111111111111111";
const POOL_ADDR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

// Minimal GeckoTerminal stand-ins for the paths the handlers request.
function mockGeckoResponse(url) {
  if (url.includes("/search/pools")) {
    // No pools → api/token.js resolves this to 404 TOKEN_NOT_FOUND.
    return new Response(JSON.stringify({ data: [], included: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/ohlcv/")) {
    return new Response(JSON.stringify({
      meta: { base: { address: TOKEN_ADDR }, quote: { address: "0x2222222222222222222222222222222222222222" } },
      data: { attributes: { ohlcv_list: [
        [1_700_000_000, 1, 2, 0.5, 1.5, 100],
        [1_700_003_600, 1.5, 2.5, 1, 2, 120],
      ] } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ errors: [{ title: "unexpected mock path" }] }), { status: 500 });
}

test("serveApi hardening over real HTTP (stubbed upstream)", async t => {
  const realFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.geckoterminal.com/")) {
      upstreamCalls.push(url);
      return Promise.resolve(mockGeckoResponse(url));
    }
    if (url.startsWith("https://api.coingecko.com/")) {
      return Promise.resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return realFetch(input, init);
  };
  const { createApiServer } = await import("./server.js");
  const server = createApiServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const searchCalls = () => upstreamCalls.filter(u => u.includes("/search/pools")).length;
  const ohlcvCalls = () => upstreamCalls.filter(u => u.includes("/ohlcv/")).length;

  try {
    await t.test("negative cache: two identical 404s cost one upstream call", async () => {
      const bad = `${base}/api/token?address=0xdead000000000000000000000000000000000001`;
      const first = await fetch(bad);
      assert.equal(first.status, 404);
      assert.equal(first.headers.get("x-cmvng-cache"), "miss");
      assert.equal((await first.json()).error.code, "TOKEN_NOT_FOUND");
      const second = await fetch(bad);
      assert.equal(second.status, 404);
      assert.equal(second.headers.get("x-cmvng-cache"), "hit");
      assert.equal((await second.json()).error.code, "TOKEN_NOT_FOUND");
      assert.equal(searchCalls(), 1, "the repeat 404 must be served from the negative cache");
    });

    await t.test("cache key: param order, aliases, and hex case share one entry", async () => {
      const variants = [
        `network=eth&pool=${POOL_ADDR}&token=${TOKEN_ADDR}&timeframe=hour&limit=10`,
        // reordered params
        `token=${TOKEN_ADDR}&limit=10&timeframe=hour&network=eth&pool=${POOL_ADDR}`,
        // aliased param names (api/candles.js: poolAddress|pool, tokenAddress|token|address)
        `network=eth&poolAddress=${POOL_ADDR}&tokenAddress=${TOKEN_ADDR}&timeframe=hour&limit=10`,
        // hex-address case variant (addresses are case-insensitive for 0x-hex)
        `network=eth&pool=0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD&token=${TOKEN_ADDR}&timeframe=hour&limit=10`,
      ];
      const first = await fetch(`${base}/api/candles?${variants[0]}`);
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("x-cmvng-cache"), "miss");
      assert.equal((await first.json()).candles.length, 2);
      for (const query of variants.slice(1)) {
        const res = await fetch(`${base}/api/candles?${query}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("x-cmvng-cache"), "hit", query);
      }
      assert.equal(ohlcvCalls(), 1, "all variants must share one upstream OHLCV call");
    });

    await t.test("cache key: a smuggled delimiter cannot poison another request's entry", async () => {
      // Attacker: no token param (→ 400, negative-cached) but a timeframe
      // value that DECODES to "hour&token=<addr>". Without re-encoding, its
      // key would be byte-identical to the victim's valid request below, so
      // the victim would be served the cached 400.
      const smuggled = encodeURIComponent(`hour&token=${TOKEN_ADDR}`);
      const attacker = await fetch(
        `${base}/api/candles?network=eth&pool=${POOL_ADDR}&timeframe=${smuggled}&aggregate=1&limit=500`,
      );
      assert.equal(attacker.status, 400, "the tokenless request itself must fail");
      const victim = await fetch(
        `${base}/api/candles?network=eth&pool=${POOL_ADDR}&token=${TOKEN_ADDR}&timeframe=hour&aggregate=1&limit=500`,
      );
      assert.equal(victim.status, 200, "the valid request must not hit the attacker's cached 400");
      assert.equal(victim.headers.get("x-cmvng-cache"), "miss");
      assert.equal((await victim.json()).candles.length, 2);
    });

    await t.test("per-IP limiter: allows the budget, 429s the next, other IPs unaffected", async () => {
      // The trusted last hop of x-forwarded-for simulates distinct client IPs.
      const ipA = { "x-forwarded-for": "203.0.113.7" };
      for (let i = 0; i < 60; i++) {
        // Distinct unknown-param requests: 400 without an upstream call, and
        // distinct cache keys so none is a (budget-free) cache hit.
        const res = await fetch(`${base}/api/token?bogus=${i}`, { headers: ipA });
        assert.equal(res.status, 400, `request ${i} within the budget must pass the limiter`);
      }
      const blocked = await fetch(`${base}/api/token?bogus=60`, { headers: ipA });
      assert.equal(blocked.status, 429);
      assert.equal((await blocked.json()).error.code, "RATE_LIMITED");
      const retryAfter = Number(blocked.headers.get("retry-after"));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, "Retry-After in seconds");
      // /api/candles shares the same budget.
      const candlesBlocked = await fetch(`${base}/api/candles?bogus=1`, { headers: ipA });
      assert.equal(candlesBlocked.status, 429);
      // A different client IP is unaffected.
      const other = await fetch(`${base}/api/token?bogus=61`, { headers: { "x-forwarded-for": "203.0.113.8" } });
      assert.equal(other.status, 400);
      // /api/coins sits outside the limiter (the classic surface polls it).
      const coins = await fetch(`${base}/api/coins?type=list`, { headers: ipA });
      assert.equal(coins.status, 200);
    });
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
  }
});
