// Standalone production server (used on Railway / any Node host).
// Serves the static Vite build from dist/ and handles /api/coins with the
// SAME handler that runs as a Vercel Edge Function in a Vercel deploy.
// Since there is no edge cache here, responses are cached in memory using
// each response's own s-maxage — so CoinGecko still gets ~1 call per window.

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

// url -> { body:Buffer, headers:Object, status:number, expires:number }
const apiCache = new Map();
const MAX_CACHE_ENTRIES = 500;

function cacheTtlMs(headers) {
  const cc = headers["cache-control"] || "";
  const m = /s-maxage=(\d+)/.exec(cc);
  return m ? Number(m[1]) * 1000 : 0;
}

const EDGE_API_HANDLERS = new Map([
  ["/api/coins", coinsHandler],
  ["/api/token", tokenHandler],
  ["/api/candles", candlesHandler],
]);

async function serveApi(req, res, url, handler) {
  const isGet = req.method === "GET";
  const key = `${req.method}:${url.pathname}${url.search}`;
  const hit = apiCache.get(key);
  if (isGet && hit && hit.expires > Date.now()) {
    res.writeHead(hit.status, { ...hit.headers, "x-cmvng-cache": "hit" });
    res.end(hit.body);
    return;
  }
  const request = new Request(`http://localhost${key}`, { method: req.method, headers: req.headers });
  const response = await handler(request);
  const body = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const ttl = response.status === 200 ? cacheTtlMs(headers) : 0;
  if (isGet && ttl > 0) {
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = apiCache.keys().next().value;
      apiCache.delete(oldest);
    }
    apiCache.set(key, { body, headers, status: response.status, expires: Date.now() + ttl });
  }
  res.writeHead(response.status, { ...headers, "x-cmvng-cache": "miss" });
  res.end(body);
}

// /api/plans — server-stored public plans (api/plans.js owns store + routing).
const PLANS_BODY_LIMIT = 16 * 1024; // 16KB is far beyond any valid plan config

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request body too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function servePlans(req, res, url) {
  const writeJson = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  // first hop of x-forwarded-for, else the socket address (rate limiting only,
  // held in memory — never stored)
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.socket?.remoteAddress || "unknown";
  let body = null;
  if (req.method === "POST") {
    let raw;
    try {
      raw = await readBody(req, PLANS_BODY_LIMIT);
    } catch (e) {
      return writeJson(e.status || 400, { error: e.status === 413 ? "Plan config too large." : "Could not read request body." });
    }
    try {
      body = JSON.parse(raw || "null");
    } catch {
      return writeJson(400, { error: "Request body must be valid JSON." });
    }
  }
  const out = handlePlansRequest({ method: req.method, url, body, ip });
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

http.createServer(async (req, res) => {
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
}).listen(PORT, () => console.log(`CMVNG DCA Simulator listening on :${PORT}`));
