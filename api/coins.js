/**
 * CMVNG DCA Simulator — Vercel Edge proxy for CoinGecko.
 *
 * Endpoints:
 *   GET /api/coins?type=list            → top 250 coins (edge-cached 12h)
 *   GET /api/coins?type=history&id=XXX  → 365-day daily price history (edge-cached 12h)
 *   GET /api/coins?type=price&id=XXX    → live price + 24h change (edge-cached 60s)
 *   GET /api/coins?type=image&url=XXX   → CORS-safe CoinGecko image proxy (edge-cached 7d)
 *
 * Caching: responses carry Cache-Control s-maxage headers; Vercel's edge cache
 * serves repeats without invoking this function, so CoinGecko is only called
 * when a cache window expires. (Edge cache HITs never reach this code — every
 * invocation logged below is effectively a cache MISS.)
 *
 * Every JSON payload includes `fetchedAt` (ms epoch, upstream fetch time) so
 * the client can show honest "Updated X ago" staleness labels even when the
 * response was served from the edge cache.
 */

const CG = "https://api.coingecko.com/api/v3";

// Stablecoins + wrapped/liquid-staked assets excluded from the coin list —
// DCA-ing into a pegged or wrapper asset is not meaningful.
const STABLE = new Set([
  "tether","usd-coin","binance-usd","dai","true-usd","frax","usdp","neutrino",
  "gemini-dollar","liquity-usd","fei-usd","usdd","celo-dollar","terraclassicusd",
  "paxos-standard","nusd","flex-usd","usdk","husd","usdx","vai","susd","musd",
  "dola-usd","origin-dollar","usdn","sperax-usd","paypal-usd","first-digital-usd",
  "usde","ethena-usde","usdy","mountain-protocol-usdm","ondo-us-dollar-yield",
  "usdb","reserve-rights-token","volt-protocol","float-protocol","fei-protocol",
  "frax-share","terra-luna-2","terrausd","tribe","gyroscope-gyd","crvusd",
  "gho","raft","deusd","lvusd","eura","djed","mkr-governance-token",
  "stasis-eurs","ageur","eurc","euro-coin","tether-eurt","steur","eurs",
  "wrapped-bitcoin","wrapped-ethereum","staked-ether","rocket-pool-eth",
  "lido-staked-ether","coinbase-wrapped-staked-eth","mantle-staked-ether",
  "stakewise-v3-oseth","frax-ether","stakehound-staked-ether","wrapped-steth",
  "weth","wbtc","weeth","reth","cbeth","sfrxeth","ankr-staked-eth",
  "sweth","meth","rseth","ezeth","pufeth","apxeth","woeth",
  "wrapped-avax","wrapped-bnb","wrapped-fantom","wrapped-matic","wrapped-near",
  "bridged-usdc-polygon-pos-bridge","bridged-usdt",
]);

class UpstreamError extends Error {
  constructor(status) {
    super(`CoinGecko error: ${status}`);
    this.status = status;
  }
}

async function cgFetch(path) {
  const apiKey = process.env.COINGECKO_API_KEY;
  const url = `${CG}${path}${apiKey ? (path.includes("?") ? "&" : "?") + "x_cg_demo_api_key=" + apiKey : ""}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new UpstreamError(res.status);
  return res.json();
}

function jsonResponse(data, cacheSeconds) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    },
  });
}

function errorResponse(message, status = 500, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

const VALID_ID = /^[a-z0-9-]{1,64}$/;

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" },
    });
  }

  const url = new URL(req.url, "https://placeholder.com");
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const started = Date.now();

  try {
    // ── Top 250 coins ────────────────────────────────────────────────────────
    if (type === "list") {
      const [p1, p2, p3] = await Promise.all([
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1"),
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=2"),
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3"),
      ]);
      const coins = [...p1, ...p2, ...p3]
        .filter(coin => !STABLE.has(coin.id))
        .slice(0, 250);
      logReq(type, started, 200);
      return jsonResponse({ fetchedAt: Date.now(), coins }, 43200);
    }

    // ── 365-day daily price history ──────────────────────────────────────────
    // 365 days supports duration-matched scenario windows AND the rolling-
    // window robustness analysis + historical backtest mode.
    if (type === "history" && id) {
      if (!VALID_ID.test(id)) return errorResponse("Invalid coin id", 400);
      // days=365 → CoinGecko auto-granularity returns daily points (no
      // interval param: it is not available on all API plans).
      const data = await cgFetch(`/coins/${id}/market_chart?vs_currency=usd&days=365`);
      logReq(type, started, 200);
      return jsonResponse({ ...data, fetchedAt: Date.now() }, 43200);
    }

    // ── Live price ───────────────────────────────────────────────────────────
    if (type === "price" && id) {
      if (!VALID_ID.test(id)) return errorResponse("Invalid coin id", 400);
      const data = await cgFetch(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
      logReq(type, started, 200);
      return jsonResponse({ fetchedAt: Date.now(), data }, 60);
    }

    // ── CORS-safe image proxy (canvas needs same-origin images) ──────────────
    if (type === "image") {
      const imgUrl = url.searchParams.get("url");
      if (!imgUrl) return errorResponse("Missing url param", 400);
      // Strict allow-list: only CoinGecko's image CDNs, https only.
      if (!imgUrl.startsWith("https://assets.coingecko.com/") &&
          !imgUrl.startsWith("https://coin-images.coingecko.com/")) {
        return errorResponse("Only CoinGecko image URLs allowed", 403);
      }
      try {
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) throw new Error("Image fetch failed");
        const blob = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("content-type") || "image/png";
        if (!contentType.startsWith("image/")) return errorResponse("Not an image", 502);
        logReq(type, started, 200);
        return new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
          },
        });
      } catch {
        return errorResponse("Could not fetch image", 502);
      }
    }

    return errorResponse("Unknown endpoint. Use type=list, type=history&id=XXX, type=price&id=XXX, or type=image&url=XXX", 400);

  } catch (err) {
    const upstream = err instanceof UpstreamError ? err.status : null;
    logReq(type, started, upstream || 502, err.message);
    if (upstream === 429) {
      return errorResponse("Market data provider rate limit reached. Please try again in a minute.", 429, { "Retry-After": "60" });
    }
    return errorResponse("Market data is temporarily unavailable. Try again in a moment.", 502);
  }
}

function logReq(type, started, status, msg = "") {
  // Every invocation is an edge-cache MISS; latency/status per upstream call.
  console.log(JSON.stringify({ t: "coins_proxy", type, status, ms: Date.now() - started, msg }));
}

export const config = { runtime: "edge" };
