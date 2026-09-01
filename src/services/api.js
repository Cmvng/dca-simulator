// Client-side data service: proxy calls + localStorage cache with honest
// staleness. Every result carries { data, fetchedAt, stale } so the UI can
// always show "Updated X ago" and label stale fallbacks.

const PROXY = "/api/coins";
const LIST_TTL = 12 * 60 * 60 * 1000;
const HISTORY_TTL = 12 * 60 * 60 * 1000;
const PRICE_TTL = 60 * 1000;

const cache = {
  get(k, ttl) {
    try {
      const r = localStorage.getItem("cmv_" + k);
      if (!r) return null;
      const { d, t } = JSON.parse(r);
      return Date.now() - t < ttl ? { d, t } : null;
    } catch { return null; }
  },
  set(k, d) {
    try { localStorage.setItem("cmv_" + k, JSON.stringify({ d, t: Date.now() })); } catch { }
  },
  stale(k) {
    try {
      const r = localStorage.getItem("cmv_" + k);
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
};

export class ApiError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError("Network problem — check your connection.", { status: 0 });
  }
  if (res.status === 429) throw new ApiError("Market data provider is rate-limiting. Try again in a minute.", { status: 429 });
  if (!res.ok) throw new ApiError("Market data is temporarily unavailable. Try again in a moment.", { status: res.status });
  try {
    return await res.json();
  } catch {
    throw new ApiError("Received a malformed response from the market data service.", { status: res.status });
  }
}

// Top 250 coins. Handles both v2 ({fetchedAt, coins}) and legacy (array) shapes.
export async function getCoins() {
  const hit = cache.get("coins250", LIST_TTL);
  if (hit) {
    // v1 clients cached the bare array; anything without a non-empty coins
    // array is a miss, not a crash.
    const d = Array.isArray(hit.d) ? { coins: hit.d, fetchedAt: hit.t } : hit.d;
    if (Array.isArray(d?.coins) && d.coins.length > 0) {
      return { data: d.coins, fetchedAt: d.fetchedAt || hit.t, stale: false };
    }
  }
  try {
    const json = await fetchJson(`${PROXY}?type=list`);
    const payload = Array.isArray(json) ? { coins: json, fetchedAt: Date.now() } : json;
    if (!Array.isArray(payload.coins) || payload.coins.length === 0) {
      throw new ApiError("Coin list came back empty. Try again in a moment.");
    }
    cache.set("coins250", payload);
    return { data: payload.coins, fetchedAt: payload.fetchedAt, stale: false };
  } catch (e) {
    const stale = cache.stale("coins250");
    if (stale?.d?.coins || Array.isArray(stale?.d)) {
      const coins = stale.d.coins || stale.d;
      return { data: coins, fetchedAt: stale.d.fetchedAt || stale.t, stale: true };
    }
    throw e instanceof ApiError ? e : new ApiError("Could not load coins. Check your connection and refresh.");
  }
}

// Live price. Handles v2 ({fetchedAt, data:{id:{usd}}}) and legacy ({id:{usd}}).
export async function getLivePrice(id) {
  const hit = cache.get("lp_" + id, PRICE_TTL);
  if (hit && Number.isFinite(hit.d?.price)) return { data: hit.d, fetchedAt: hit.t, stale: false };
  try {
    const json = await fetchJson(`${PROXY}?type=price&id=${encodeURIComponent(id)}`);
    const body = json.data || json;
    if (!body[id]) return null;
    const result = { price: body[id].usd, change24h: body[id].usd_24h_change || 0 };
    if (!Number.isFinite(result.price)) return null;
    cache.set("lp_" + id, result);
    return { data: result, fetchedAt: json.fetchedAt || Date.now(), stale: false };
  } catch {
    const stale = cache.stale("lp_" + id);
    if (stale) return { data: stale.d, fetchedAt: stale.t, stale: true };
    return null; // live price is optional — history's last close is the fallback
  }
}

// 365-day daily history.
export async function getHistory(id) {
  const hit = cache.get("h_" + id, HISTORY_TTL);
  if (hit && Array.isArray(hit.d?.prices)) return { data: hit.d, fetchedAt: hit.d.fetchedAt || hit.t, stale: false };
  try {
    const json = await fetchJson(`${PROXY}?type=history&id=${encodeURIComponent(id)}`);
    if (!Array.isArray(json.prices)) throw new ApiError("Price history came back malformed.");
    cache.set("h_" + id, json);
    return { data: json, fetchedAt: json.fetchedAt || Date.now(), stale: false };
  } catch (e) {
    const stale = cache.stale("h_" + id);
    if (stale) return { data: stale.d, fetchedAt: stale.d.fetchedAt || stale.t, stale: true };
    throw e instanceof ApiError ? e : new ApiError("Could not load price history.");
  }
}

export const imageProxyUrl = src =>
  src && src.includes("coingecko.com") ? `${PROXY}?type=image&url=${encodeURIComponent(src)}` : src;
