// E2E for server.js /api/plans wiring: spawns the real server as a child
// process (pattern: tools/plans-e2e.mjs — dist/ is not needed for /api/plans)
// and drives it with fetch over real HTTP. Proves the 413 path delivers an
// actual response instead of a connection reset, and that the owner token is
// honored ONLY via the x-cmvng-owner-token header.

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
