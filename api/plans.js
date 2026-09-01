// Server-stored public plans — /plan/<id> short links (docs/PUBLIC_PLANS.md).
//
// Pure Node ESM module: a tiny JSON-file KV store plus a framework-free
// request handler. server.js (production) and vite.config.js (dev) both call
// handlePlansRequest and write the response themselves; Express is not used.
//
// Privacy rules (carried over from the hash-link mechanism):
//   - a stored plan is ONLY { id, createdAt, modelVersion, config, revoked,
//     ownerTokenHash } — no names, no photos, no IPs at rest;
//   - config is validated with the SAME rules as src/lib/planUrl.js decode
//     (unknown fields dropped, invalid values rejected);
//   - the owner token (the revocation capability) is returned exactly once at
//     creation and only its sha256 hash is stored, so the data file never
//     contains the capability;
//   - ids are crypto-random and unguessable, but treated as public once shared;
//   - rate-limit bookkeeping (per-IP timestamps) lives in memory only.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_VERSION } from "../src/lib/version.js";
import { MIN_CAPITAL, MAX_CAPITAL } from "../src/lib/simulation/dca.js";

// Default dir keeps dev/test usage out of the repo tree; production sets
// PLANS_DIR explicitly (e.g. PLANS_DIR=/data on a host with a volume).
const DEFAULT_DIR = () => process.env.PLANS_DIR || "./node_modules/.cache/cmvng-plans";
const FILE_NAME = "plans.json";
const DEFAULT_CAP = 5000; // total stored plans (revoked tombstones included)

const ID_LEN = 8;
const ID_RE = /^[a-z0-9]{8}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

const RATE_LIMIT_MAX = 10; // creates per IP…
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // …per hour

export class PlanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── store state ──────────────────────────────────────────────────────────────

let state = null; // { dir, file, plans: Map<id, rec>, cap }
const rateLog = new Map(); // ip -> [timestamps] — memory only, never persisted

// (Re)initialize the store. Tests call this with a temp dir; production code
// never needs to — the first use lazily initializes from PLANS_DIR.
export function _initStore(dir = DEFAULT_DIR(), { cap = DEFAULT_CAP } = {}) {
  const file = join(dir, FILE_NAME);
  const plans = new Map();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      for (const rec of Array.isArray(parsed?.plans) ? parsed.plans : []) {
        if (rec && ID_RE.test(rec.id || "")) plans.set(rec.id, rec);
      }
    } catch {
      // corrupt file: start empty rather than crash; next flush rewrites it
    }
  }
  state = { dir, file, plans, cap };
  rateLog.clear();
  return { dir, cap, count: plans.size };
}

function store() {
  if (!state) _initStore();
  return state;
}

function flush() {
  const st = store();
  mkdirSync(st.dir, { recursive: true }); // lazy mkdir
  const tmp = st.file + ".tmp";
  writeFileSync(tmp, JSON.stringify({ plans: [...st.plans.values()] }));
  renameSync(tmp, st.file); // atomic swap — readers never see a partial file
}

// ── validation (mirrors decodePlanFromHash in src/lib/planUrl.js) ───────────

const NUM_RULES = {
  // engine bounds — a plan that passes here must also run for every visitor
  capital: [MIN_CAPITAL, MAX_CAPITAL],
  months: [1, 6],
  targetPct: [1, 1000],
  feePct: [0, 10],
  feeFixed: [0, 1000],
  slippagePct: [0, 5],
  hybridPct: [0, 100],
};
const FREQ_IDS = ["12h", "daily", "weekly", "biweekly"];
const MODES = ["scenario", "backtest"];

export function validateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlanError("Plan config must be a JSON object.");
  }
  const out = {};
  if (typeof input.coinId !== "string" || !/^[a-z0-9-]{1,64}$/.test(input.coinId)) {
    throw new PlanError("coinId is required: 1–64 lowercase letters, digits, or hyphens.");
  }
  out.coinId = input.coinId;
  for (const [field, [min, max]] of Object.entries(NUM_RULES)) {
    const v = input[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      throw new PlanError(`${field} must be a number between ${min} and ${max}.`);
    }
    out[field] = v;
  }
  if (input.freqId !== undefined && input.freqId !== null) {
    if (!FREQ_IDS.includes(input.freqId)) throw new PlanError(`freqId must be one of: ${FREQ_IDS.join(", ")}.`);
    out.freqId = input.freqId;
  }
  if (input.mode !== undefined && input.mode !== null) {
    if (!MODES.includes(input.mode)) throw new PlanError(`mode must be one of: ${MODES.join(", ")}.`);
    out.mode = input.mode;
  }
  return out; // any other field is dropped
}

// ── ids & tokens ─────────────────────────────────────────────────────────────

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomId(len = ID_LEN) {
  // Unbiased base36 from crypto-random bytes (rejection-sample ≥ 252 = 36*7).
  const out = [];
  while (out.length < len) {
    for (const b of randomBytes(16)) {
      if (b < 252) {
        out.push(ALPHABET[b % 36]);
        if (out.length === len) break;
      }
    }
  }
  return out.join("");
}

const sha256 = s => createHash("sha256").update(s).digest("hex");

function tokenMatches(token, storedHash) {
  if (typeof token !== "string" || !TOKEN_RE.test(token) || typeof storedHash !== "string") return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── core API ─────────────────────────────────────────────────────────────────

// createPlan(config) → { id, ownerToken }. Throws PlanError (400 on invalid
// config, 507 when the store is full).
export function createPlan(config) {
  const st = store();
  const validated = validateConfig(config);
  if (st.plans.size >= st.cap) {
    throw new PlanError("Plan storage is full — no new public plans can be published right now.", 507);
  }
  let id = randomId();
  while (st.plans.has(id)) id = randomId();
  const ownerToken = randomBytes(16).toString("hex"); // 32 hex chars, returned once
  st.plans.set(id, {
    id,
    createdAt: Date.now(),
    modelVersion: MODEL_VERSION,
    config: validated,
    revoked: false,
    ownerTokenHash: sha256(ownerToken),
  });
  flush();
  return { id, ownerToken };
}

// getPlan(id) → { id, createdAt, modelVersion, config } or null.
// Revoked and unknown plans are indistinguishable; the token hash never leaves.
export function getPlan(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  const rec = store().plans.get(id);
  if (!rec || rec.revoked) return null;
  return { id: rec.id, createdAt: rec.createdAt, modelVersion: rec.modelVersion, config: { ...rec.config } };
}

// revokePlan(id, token) → true when the token matches (idempotent), else false.
export function revokePlan(id, token) {
  if (typeof id !== "string" || !ID_RE.test(id)) return false;
  const rec = store().plans.get(id);
  if (!rec || !tokenMatches(token, rec.ownerTokenHash)) return false;
  if (!rec.revoked) {
    rec.revoked = true;
    flush();
  }
  return true;
}

// ── rate limiting (in-memory, transient — IPs never reach disk) ─────────────

// Past this many keys, each call also sweeps fully-expired IPs so the map is
// bounded by active traffic, not by every IP ever seen. No timers — sweeps
// piggyback on calls, keeping behavior deterministic under injected clocks.
const RATE_SWEEP_THRESHOLD = 512;

function sweepRateLog(cutoff) {
  for (const [key, ts] of rateLog) {
    const live = ts.filter(t => t > cutoff);
    if (live.length === 0) rateLog.delete(key);
    else if (live.length < ts.length) rateLog.set(key, live);
  }
}

function rateLimited(ip, now = Date.now()) {
  const key = ip || "unknown";
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  if (rateLog.size > RATE_SWEEP_THRESHOLD) sweepRateLog(cutoff);
  const hits = (rateLog.get(key) || []).filter(t => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLog.set(key, hits);
    return true;
  }
  hits.push(now);
  rateLog.set(key, hits);
  return false;
}

// Test hooks (same precedent as _initStore): drive the limiter with injected
// timestamps and observe the bookkeeping map without exposing its contents.
export const _rateLimited = rateLimited;
export const _rateLogSize = () => rateLog.size;

// ── request handler ──────────────────────────────────────────────────────────

// handlePlansRequest({ method, url, body, ip, token }) → { status, body }.
// The caller (server.js / vite middleware / default export) reads the request
// body, extracts the client IP (x-forwarded-for LAST hop or socket address)
// and the owner token (x-cmvng-owner-token header — never the query string,
// which lands in access logs), and writes the response with no-store cache
// headers. `url` is a URL instance or string.
export function handlePlansRequest({ method, url, body, ip, token }) {
  const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
  try {
    switch ((method || "").toUpperCase()) {
      case "POST": {
        if (rateLimited(ip)) {
          return { status: 429, body: { error: "Too many plans published from this connection — try again in an hour." } };
        }
        const { id, ownerToken } = createPlan(body);
        return { status: 201, body: { id, ownerToken } };
      }
      case "GET": {
        const rec = getPlan(u.searchParams.get("id"));
        if (!rec) return { status: 404, body: { error: "This plan does not exist or was removed by its creator." } };
        return { status: 200, body: rec };
      }
      case "DELETE": {
        const ok = revokePlan(u.searchParams.get("id"), token);
        if (!ok) return { status: 404, body: { error: "Unknown plan or invalid token." } };
        return { status: 200, body: { revoked: true } };
      }
      default:
        return { status: 405, body: { error: "Method not allowed. Use POST, GET, or DELETE." } };
    }
  } catch (e) {
    if (e instanceof PlanError) return { status: e.status, body: { error: e.message } };
    console.error("plans store error:", e.message);
    return { status: 500, body: { error: "Plan storage failed. Try again in a moment." } };
  }
}

// ── Vercel function adapter ──────────────────────────────────────────────────

const BODY_LIMIT = 16 * 1024; // matches server.js — far beyond any valid plan

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Web-standard Request → Response wrapper so a Vercel deploy serves /api/plans
// the same way api/coins.js is served. Node runtime (the store needs node:fs).
export default async function plansHandler(request) {
  const url = new URL(request.url, "http://localhost");
  // last x-forwarded-for hop — appended by the platform edge; earlier hops
  // are client-supplied and spoofable
  const hops = String(request.headers.get("x-forwarded-for") || "")
    .split(",").map(h => h.trim()).filter(Boolean);
  const ip = hops[hops.length - 1] || "unknown";
  const token = request.headers.get("x-cmvng-owner-token");
  let body = null;
  if (request.method.toUpperCase() === "POST") {
    let raw;
    try {
      raw = await request.text();
    } catch {
      return jsonResponse(400, { error: "Could not read request body." });
    }
    if (new TextEncoder().encode(raw).length > BODY_LIMIT) {
      return jsonResponse(413, { error: "Plan config too large." });
    }
    try {
      body = JSON.parse(raw || "null");
    } catch {
      return jsonResponse(400, { error: "Request body must be valid JSON." });
    }
  }
  const out = handlePlansRequest({ method: request.method, url, body, ip, token });
  return jsonResponse(out.status, out.body);
}
