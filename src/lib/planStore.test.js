// Unit tests for the server-stored public plans store (api/plans.js).
// Hermetic: each test re-inits the store into a fresh temp dir via _initStore.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plansHandler, {
  _initStore, _rateLimited, _rateLogSize,
  createPlan, getPlan, revokePlan, handlePlansRequest, PlanError,
} from "../../api/plans.js";
import { MODEL_VERSION } from "./version.js";

const freshDir = () => mkdtempSync(join(tmpdir(), "cmvng-plans-"));

const VALID = {
  coinId: "bitcoin", capital: 500, freqId: "daily", months: 3, targetPct: 50,
  feePct: 0.5, feeFixed: 1, slippagePct: 0.2, hybridPct: 30, mode: "scenario",
};

test("create → get roundtrip echoes validated config and drops unknown fields", () => {
  const dir = freshDir();
  _initStore(dir);
  const { id, ownerToken } = createPlan({ ...VALID, name: "Satoshi", photo: "x.png", evil: true });
  assert.match(id, /^[a-z0-9]{8}$/);
  assert.match(ownerToken, /^[0-9a-f]{32}$/);
  const rec = getPlan(id);
  assert.equal(rec.id, id);
  assert.equal(rec.modelVersion, MODEL_VERSION);
  assert.ok(rec.createdAt > 0);
  assert.deepEqual(rec.config, VALID); // unknown fields (name/photo/evil) dropped
  assert.equal(rec.ownerTokenHash, undefined); // hash never leaves the store
});

test("owner token is never stored in plain text", () => {
  const dir = freshDir();
  _initStore(dir);
  const { ownerToken } = createPlan(VALID);
  const raw = readFileSync(join(dir, "plans.json"), "utf8");
  assert.ok(!raw.includes(ownerToken), "plans.json must not contain the token");
  assert.ok(raw.includes("ownerTokenHash"), "plans.json stores only the hash");
});

test("createPlan rejects invalid configs with 400", () => {
  _initStore(freshDir());
  const rejects = [
    { ...VALID, coinId: "Bad Coin!" },       // bad coinId
    { ...VALID, coinId: undefined },         // coinId required
    { ...VALID, capital: 0 },                // below clamp
    { ...VALID, capital: 5 },                // below the engine's MIN_CAPITAL floor
    { ...VALID, months: 7 },                 // above clamp
    { ...VALID, freqId: "hourly" },          // unknown enum
    { ...VALID, mode: "yolo" },              // unknown enum
    { ...VALID, targetPct: "50" },           // wrong type
    "not-an-object",
  ];
  for (const bad of rejects) {
    assert.throws(() => createPlan(bad), e => e instanceof PlanError && e.status === 400, JSON.stringify(bad));
  }
});

test("getPlan validates the id format", () => {
  _initStore(freshDir());
  const { id } = createPlan(VALID);
  assert.ok(getPlan(id));
  for (const bad of ["", "abc", id.toUpperCase(), "../../../../etc/passwd", "aaaaaaaaa", null, 42]) {
    assert.equal(getPlan(bad), null);
  }
});

test("revoke: wrong token fails, right token hides the plan", () => {
  _initStore(freshDir());
  const { id, ownerToken } = createPlan(VALID);
  const wrong = ownerToken.slice(0, 31) + (ownerToken.endsWith("0") ? "1" : "0");
  assert.equal(revokePlan(id, wrong), false);
  assert.equal(revokePlan(id, "nonsense"), false);
  assert.ok(getPlan(id), "plan survives failed revocations");
  assert.equal(revokePlan(id, ownerToken), true);
  assert.equal(getPlan(id), null, "revoked plan reads as unknown");
  assert.equal(revokePlan(id, ownerToken), true, "revocation is idempotent");
});

test("store persists across re-init from the same dir", () => {
  const dir = freshDir();
  _initStore(dir);
  const { id } = createPlan(VALID);
  _initStore(dir); // simulate process restart
  assert.deepEqual(getPlan(id).config, VALID);
});

test("rate limiter: 11th create from the same ip is rejected, different ip fine", () => {
  _initStore(freshDir());
  const url = new URL("http://localhost/api/plans");
  for (let i = 0; i < 10; i++) {
    const out = handlePlansRequest({ method: "POST", url, body: VALID, ip: "1.2.3.4" });
    assert.equal(out.status, 201, `create #${i + 1} allowed`);
  }
  const eleventh = handlePlansRequest({ method: "POST", url, body: VALID, ip: "1.2.3.4" });
  assert.equal(eleventh.status, 429);
  assert.match(eleventh.body.error, /try again/i);
  const other = handlePlansRequest({ method: "POST", url, body: VALID, ip: "5.6.7.8" });
  assert.equal(other.status, 201);
});

test("storage cap rejects new plans when full", () => {
  _initStore(freshDir(), { cap: 2 });
  createPlan(VALID);
  createPlan({ ...VALID, coinId: "ethereum" });
  assert.throws(() => createPlan({ ...VALID, coinId: "solana" }),
    e => e instanceof PlanError && e.status === 507);
  const out = handlePlansRequest({
    method: "POST", url: "http://localhost/api/plans", body: { ...VALID, coinId: "solana" }, ip: "9.9.9.9",
  });
  assert.equal(out.status, 507);
});

test("handler: full POST → GET → DELETE → GET lifecycle, token hash never echoed", () => {
  _initStore(freshDir());
  const post = handlePlansRequest({ method: "POST", url: "http://localhost/api/plans", body: VALID, ip: "a" });
  assert.equal(post.status, 201);
  const { id, ownerToken } = post.body;

  const get = handlePlansRequest({ method: "GET", url: `http://localhost/api/plans?id=${id}`, body: null, ip: "a" });
  assert.equal(get.status, 200);
  assert.deepEqual(get.body.config, VALID);
  assert.ok(!JSON.stringify(get.body).includes("ownerTokenHash"));

  const badDel = handlePlansRequest({ method: "DELETE", url: `http://localhost/api/plans?id=${id}`, body: null, ip: "a", token: "0".repeat(32) });
  assert.equal(badDel.status, 404);

  const del = handlePlansRequest({ method: "DELETE", url: `http://localhost/api/plans?id=${id}`, body: null, ip: "a", token: ownerToken });
  assert.equal(del.status, 200);
  assert.deepEqual(del.body, { revoked: true });

  const gone = handlePlansRequest({ method: "GET", url: `http://localhost/api/plans?id=${id}`, body: null, ip: "a" });
  assert.equal(gone.status, 404);

  const put = handlePlansRequest({ method: "PUT", url: "http://localhost/api/plans", body: null, ip: "a" });
  assert.equal(put.status, 405);
});

test("handler: a token passed only as ?token=... is ignored (404)", () => {
  _initStore(freshDir());
  const post = handlePlansRequest({ method: "POST", url: "http://localhost/api/plans", body: VALID, ip: "a" });
  const { id, ownerToken } = post.body;
  const del = handlePlansRequest({
    method: "DELETE", url: `http://localhost/api/plans?id=${id}&token=${ownerToken}`, body: null, ip: "a",
  });
  assert.equal(del.status, 404, "query-string token must not revoke");
  assert.ok(getPlan(id), "plan survives the query-string attempt");
});

test("createPlan rejects capital below the engine floor with 400", () => {
  _initStore(freshDir());
  assert.throws(() => createPlan({ ...VALID, capital: 5 }),
    e => e instanceof PlanError && e.status === 400 && /capital/.test(e.message));
});

test("rate log: expired IPs are swept once the map grows past the threshold", () => {
  _initStore(freshDir()); // clears the rate log
  const t0 = 1_000_000_000_000;
  const HOUR = 60 * 60 * 1000;
  for (let i = 0; i < 600; i++) assert.equal(_rateLimited(`ip-${i}`, t0), false);
  assert.equal(_rateLogSize(), 600);
  assert.equal(_rateLimited("fresh-ip", t0 + HOUR + 1), false);
  assert.equal(_rateLogSize(), 1, "all expired keys swept; only the fresh ip remains");
});

test("default export: Request → Response adapter (Vercel path)", async () => {
  _initStore(freshDir());
  const post = await plansHandler(new Request("http://localhost/api/plans", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "6.6.6.6, 10.0.0.1" },
    body: JSON.stringify(VALID),
  }));
  assert.equal(post.status, 201);
  assert.equal(post.headers.get("cache-control"), "no-store");
  const { id, ownerToken } = await post.json();
  assert.match(id, /^[a-z0-9]{8}$/);

  const get = await plansHandler(new Request(`http://localhost/api/plans?id=${id}`));
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).config, VALID);

  const qsDel = await plansHandler(new Request(`http://localhost/api/plans?id=${id}&token=${ownerToken}`, { method: "DELETE" }));
  assert.equal(qsDel.status, 404, "query-string token is ignored");

  const del = await plansHandler(new Request(`http://localhost/api/plans?id=${id}`, {
    method: "DELETE",
    headers: { "x-cmvng-owner-token": ownerToken },
  }));
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { revoked: true });
});

test("default export: oversized body → 413 JSON, bad JSON → 400", async () => {
  _initStore(freshDir());
  const big = await plansHandler(new Request("http://localhost/api/plans", {
    method: "POST", body: "x".repeat(16 * 1024 + 1),
  }));
  assert.equal(big.status, 413);
  assert.match((await big.json()).error, /too large/i);

  const bad = await plansHandler(new Request("http://localhost/api/plans", { method: "POST", body: "{nope" }));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid JSON/i);
});
