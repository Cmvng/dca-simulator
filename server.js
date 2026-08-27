// Standalone production server (used on Railway / any Node host).
// Serves the static Vite build from dist/ and handles /api/coins with the
// SAME handler that runs as a Vercel Edge Function in a Vercel deploy.
// Since there is no edge cache here, responses are cached in memory using
// each response's own s-maxage — so CoinGecko still gets ~1 call per window.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/coins.js";

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

async function serveApi(req, res, url) {
  const key = url.pathname + url.search;
  const hit = apiCache.get(key);
  if (hit && hit.expires > Date.now()) {
    res.writeHead(hit.status, { ...hit.headers, "x-cmvng-cache": "hit" });
    res.end(hit.body);
    return;
  }
  const request = new Request(`http://localhost${key}`, { method: req.method });
  const response = await handler(request);
  const body = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const ttl = response.status === 200 ? cacheTtlMs(headers) : 0;
  if (ttl > 0) {
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = apiCache.keys().next().value;
      apiCache.delete(oldest);
    }
    apiCache.set(key, { body, headers, status: response.status, expires: Date.now() + ttl });
  }
  res.writeHead(response.status, { ...headers, "x-cmvng-cache": "miss" });
  res.end(body);
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
    if (url.pathname === "/api/coins") return await serveApi(req, res, url);
    if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
    return await serveStatic(res, url.pathname);
  } catch (e) {
    console.error("Server error:", e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
}).listen(PORT, () => console.log(`CMVNG DCA Simulator listening on :${PORT}`));
