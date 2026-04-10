/**
 * CMVNG DCA Simulator — Vercel Proxy
 * File: api/coins.js
 *
 * Handles 3 endpoints:
 *   GET /api/coins?type=list            → top 250 coins (cached 12h)
 *   GET /api/coins?type=history&id=XXX  → 120-day price history (cached 12h)
 *   GET /api/coins?type=price&id=XXX    → live price + 24h change (cached 60s)
 *
 * How caching works:
 *   Vercel Edge Cache stores responses using Cache-Control headers.
 *   CoinGecko is only called when the cache expires — not on every request.
 *   1,000 users = still just 1 CoinGecko call per cache window.
 */

const CG = "https://api.coingecko.com/api/v3";

// Stablecoins + wrapped assets to exclude
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

// Helper: fetch from CoinGecko with optional API key
async function cgFetch(path) {
  const apiKey = process.env.COINGECKO_API_KEY;
  const url = `${CG}${path}${apiKey ? (path.includes("?") ? "&" : "?") + "x_cg_demo_api_key=" + apiKey : ""}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  return res.json();
}

// Helper: send JSON response with cache headers
function jsonResponse(data, cacheSeconds, req) {
  const origin = req.headers.get ? req.headers.get("origin") : (req.headers?.origin || "*");
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    },
  });
}

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" },
    });
  }

  const url = new URL(req.url, "https://placeholder.com");
  const type = url.searchParams.get("type");
  const id   = url.searchParams.get("id");

  try {
    // ── ENDPOINT 1: Top 250 coins list ────────────────────────────────────────
    if (type === "list") {
      const [p1, p2, p3] = await Promise.all([
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1"),
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=2"),
        cgFetch("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3"),
      ]);
      const all = [...p1, ...p2, ...p3]
        .filter(coin => !STABLE.has(coin.id))
        .slice(0, 250);
      // Cache for 12 hours — coin list barely changes
      return jsonResponse(all, 43200, req);
    }

    // ── ENDPOINT 2: 120-day price history for a specific coin ─────────────────
    if (type === "history" && id) {
      // Validate id — only allow alphanumeric + hyphens to prevent injection
      if (!/^[a-z0-9-]+$/.test(id)) return errorResponse("Invalid coin id", 400);
      const data = await cgFetch(`/coins/${id}/market_chart?vs_currency=usd&days=120`);
      // Cache for 12 hours — historical data doesn't change
      return jsonResponse(data, 43200, req);
    }

    // ── ENDPOINT 3: Live price for a specific coin ────────────────────────────
    if (type === "price" && id) {
      if (!/^[a-z0-9-]+$/.test(id)) return errorResponse("Invalid coin id", 400);
      const data = await cgFetch(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
      // Cache for 60 seconds — live price needs to feel fresh
      return jsonResponse(data, 60, req);
    }

    return errorResponse("Unknown endpoint. Use type=list, type=history&id=XXX, or type=price&id=XXX", 400);

  } catch (err) {
    console.error("Proxy error:", err.message);
    return errorResponse("Failed to fetch data. CoinGecko may be temporarily unavailable.", 502);
  }
}

// Tell Vercel to use Edge Runtime — faster, global, no cold starts
export const config = {
  runtime: "edge",
};
