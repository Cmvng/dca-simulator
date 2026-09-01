// Standalone production server (used on Railway / any Node host).
// Serves the static Vite build from dist/ and handles /api/coins, /api/token
// and /api/candles with the SAME handlers that run as Vercel Edge Functions
// in a Vercel deploy. Since there is no edge cache here, responses are cached
// in memory using each response's own s-maxage — so the data providers still
// get ~1 call per window — and non-200 responses are memoized briefly so a
// client repeating a bad address does not re-hit the provider each time.
// /api/token and /api/candles additionally share a generous per-IP rate
// limit: every visitor shares this deployment's single upstream egress IP,
// so one looping client must not be able to exhaust GeckoTerminal's
// unauthenticated quota for everyone.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import coinsHandler from "./api/coins.js";
import tokenHandler from "./api/token.js";
import candlesHandler from "./api/candles.js";
import { handlePlansRequest } from "./api/plans.js";

const PORT = Number(process.env.PORT) || 3000;
const DIST = resolve(fileURLToPath(new URL("./dist/", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

// key -> { body:Buffer, headers:Object, status:number, expires:number }
const apiCache = new Map();
const MAX_CACHE_ENTRIES = 500;
// Non-200 responses advertise no-store to browsers, but memoizing them here
// briefly means a client looping one bad address costs the upstream provider
// one call per window instead of one call per request. Short enough that a
// transient upstream 5xx/429 never outlives the incident.
const NEGATIVE_TTL_MS = 30_000;

function cacheTtlMs(headers) {
  const cc = headers["cache-control"] || "";
  const m = /s-maxage=(\d+)/.exec(cc);
  return m ? Number(m[1]) * 1000 : 0;
}

// The handlers treat several spellings of a request as one resource: aliased
// param names (api/candles.js accepts pool|poolAddress and
// token|tokenAddress|address), any param order, and case-insensitive 0x-hex
// addresses (api/_onchain.js addressesEqual). Fold all of those into the
// cache/dedupe key so semantically identical requests share one cache entry
// and one in-flight upstream call. Only the KEY is normalized — the request
// forwarded upstream keeps its verbatim query string.
const CANDLES_PARAM_ALIASES = new Map([
  ["poolAddress", "pool"],
  ["tokenAddress", "token"],
  ["address", "token"],
]);
const ADDRESS_PARAMS = new Set(["address", "pool", "token"]);
const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]+$/;

function cacheKey(req, url) {
  const aliases = url.pathname === "/api/candles" ? CANDLES_PARAM_ALIASES : null;
  const parts = [];
  for (const [rawName, rawValue] of url.searchParams) {
    const name = (aliases && aliases.get(rawName)) || rawName;
    const value = ADDRESS_PARAMS.has(name) && HEX_ADDRESS_RE.test(rawValue)
      ? rawValue.toLowerCase()
      : rawValue;
    // Re-encode the DECODED name/value: a literal "&"/"=" inside a value must
    // not read as a param delimiter in the key, or an attacker could craft a
    // request whose (negative-cached) key collides with a victim's valid one.
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  parts.sort();
  return `${req.method}:${url.pathname}?${parts.join("&")}`;
}

const EDGE_API_HANDLERS = new Map([
  ["/api/coins", coinsHandler],
  ["/api/token", tokenHandler],
  ["/api/candles", candlesHandler],
]);

// key -> Promise — concurrent cache misses for the same key share ONE
// upstream call instead of stampeding the data providers. Entries are removed
// when the call settles either way: a failed fetch must not be memoized.
const inflight = new Map();

// LAST hop of x-forwarded-for, else the socket address: the last hop is the
// one appended by the trusted Railway edge, while earlier hops are client-
// supplied and would let anyone rotate fake values past the rate limits
// (rate limiting only, held in memory — never stored).
function clientIp(req) {
  const hops = String(req.headers["x-forwarded-for"] || "").split(",").map(h => h.trim()).filter(Boolean);
  return hops[hops.length - 1] || req.socket?.remoteAddress || "unknown";
}

// ── per-IP rate limit for the GeckoTerminal proxy endpoints ──────────────────
// Same sliding-window/sweep shape as api/plans.js rateLimited. The budget is
// generous for honest use (a scan costs ~2 requests, and repeat views are
// cache hits, which are free) while capping how fast any one client can burn
// the shared upstream quota. /api/coins stays outside this limiter — the
// classic surface polls it every 30 seconds per open tab.
const RATE_LIMITED_PATHS = new Set(["/api/token", "/api/candles"]);
const RATE_LIMIT_MAX = 60; // requests per IP…
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // …per minute, across both paths
// Past this many keys, each check also sweeps fully-expired IPs so the map is
// bounded by active traffic, not by every IP ever seen (see api/plans.js).
const RATE_SWEEP_THRESHOLD = 512;
const rateLog = new Map(); // ip -> [timestamps] — memory only, never persisted

function sweepRateLog(cutoff) {
  for (const [key, ts] of rateLog) {
    const live = ts.filter(t => t > cutoff);
    if (live.length === 0) rateLog.delete(key);
    else if (live.length < ts.length) rateLog.set(key, live);
  }
}

// Returns 0 when the request is allowed (and records it), otherwise the
// number of seconds until a slot frees up (for the Retry-After header).
function rateLimitRetryAfter(ip, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  if (rateLog.size > RATE_SWEEP_THRESHOLD) sweepRateLog(cutoff);
  const hits = (rateLog.get(ip) || []).filter(t => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLog.set(ip, hits);
    return Math.max(1, Math.ceil((hits[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
  }
  hits.push(now);
  rateLog.set(ip, hits);
  return 0;
}

async function fetchApi(req, url, key, handler) {
  const request = new Request(`http://localhost${url.pathname}${url.search}`, { method: req.method, headers: req.headers });
  const response = await handler(request);
  const body = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const ttl = response.status === 200 ? cacheTtlMs(headers) : NEGATIVE_TTL_MS;
  if (req.method === "GET" && ttl > 0) {
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = apiCache.keys().next().value;
      apiCache.delete(oldest);
    }
    apiCache.set(key, { body, headers, status: response.status, expires: Date.now() + ttl });
  }
  return { body, headers, status: response.status };
}

async function serveApi(req, res, url, handler) {
  const key = cacheKey(req, url);
  const hit = apiCache.get(key);
  if (req.method === "GET" && hit && hit.expires > Date.now()) {
    res.writeHead(hit.status, { ...hit.headers, "x-cmvng-cache": "hit" });
    res.end(hit.body);
    return;
  }
  // Cache hits above are free; only requests that reach a handler (and may
  // reach GeckoTerminal) spend rate-limit budget. The error body matches
  // api/_onchain.js errorResponse so clients handle it like any API error.
  if (RATE_LIMITED_PATHS.has(url.pathname)) {
    const retryAfter = rateLimitRetryAfter(clientIp(req));
    if (retryAfter > 0) {
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      });
      res.end(JSON.stringify({
        error: { code: "RATE_LIMITED", message: "Too many market-data requests from this connection. Try again shortly." },
      }));
      return;
    }
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchApi(req, url, key, handler).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const out = await pending;
  res.writeHead(out.status, { ...out.headers, "x-cmvng-cache": "miss" });
  res.end(out.body);
}

// /api/plans — server-stored public plans (api/plans.js owns store + routing).
const PLANS_BODY_LIMIT = 16 * 1024; // 16KB is far beyond any valid plan config

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = c => {
      size += c.length;
      if (size > limit) {
        // stop consuming WITHOUT destroying — the socket must stay writable
        // so the 413 response reaches the client (servePlans closes it after
        // the response has flushed)
        req.removeListener("data", onData);
        req.pause();
        reject(Object.assign(new Error("Request body too large."), { status: 413 }));
        return;
      }
      chunks.push(c);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function servePlans(req, res, url) {
  const writeJson = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const ip = clientIp(req);
  // revocation capability travels in a header — query strings land in logs
  const token = typeof req.headers["x-cmvng-owner-token"] === "string" ? req.headers["x-cmvng-owner-token"] : null;
  let body = null;
  if (req.method === "POST") {
    let raw;
    try {
      raw = await readBody(req, PLANS_BODY_LIMIT);
    } catch (e) {
      if (e.status === 413) {
        // the client may still be mid-upload: answer first, then close the
        // connection only after the 413 has flushed so it is actually seen
        res.writeHead(413, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Connection": "close",
        });
        res.end(JSON.stringify({ error: "Plan config too large." }), () => req.socket.destroy());
        return;
      }
      return writeJson(400, { error: "Could not read request body." });
    }
    try {
      body = JSON.parse(raw || "null");
    } catch {
      return writeJson(400, { error: "Request body must be valid JSON." });
    }
  }
  const out = handlePlansRequest({ method: req.method, url, body, ip, token });
  writeJson(out.status, out.body);
}

async function serveStatic(res, pathname) {
  let rel = pathname.replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  let file = resolve(join(DIST, rel));
  // path-traversal guard
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(DIST, "index.html"); // SPA fallback
  }
  try {
    const data = await readFile(file);
    const headers = { "Content-Type": MIME[extname(file)] || "application/octet-stream" };
    if (rel.startsWith("assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

// Exported so server.test.js can run the real request pipeline in-process
// (with a stubbed globalThis.fetch standing in for the upstream providers).
export function createApiServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const edgeHandler = EDGE_API_HANDLERS.get(url.pathname);
      if (edgeHandler) return await serveApi(req, res, url, edgeHandler);
      if (url.pathname === "/api/plans") return await servePlans(req, res, url);
      if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
      return await serveStatic(res, url.pathname);
    } catch (e) {
      console.error("Server error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server error" }));
    }
  });
}

// Listen only when run directly (node server.js) — never on import.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createApiServer().listen(PORT, () => console.log(`CMVNG DCA Simulator listening on :${PORT}`));
}
