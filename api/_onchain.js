const GECKO_BASE = "https://api.geckoterminal.com/api/v2";
// Public GeckoTerminal responses can occasionally take 10-12 seconds under load.
const FETCH_TIMEOUT_MS = 15_000;

const NETWORK_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Covers EVM, Solana/base58, TON-friendly/raw, Sui/Aptos and similar contract IDs
// while rejecting path separators, query delimiters, whitespace and control chars.
const ADDRESS_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]+$/;

export class ApiError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function requestUrl(req) {
  try {
    return new URL(req.url, "https://placeholder.invalid");
  } catch {
    throw new ApiError(400, "INVALID_REQUEST_URL", "The request URL is invalid.");
  }
}

export function getSingleParam(params, name, { required = false, fallback = null } = {}) {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new ApiError(400, "DUPLICATE_PARAMETER", `Use only one ${name} parameter.`);
  }
  if (values.length === 0 || values[0].trim() === "") {
    if (required) throw new ApiError(400, "MISSING_PARAMETER", `${name} is required.`);
    return fallback;
  }
  return values[0].trim();
}

export function getAliasedParam(params, names, { required = false, fallback = null } = {}) {
  const present = names.flatMap(name => params.getAll(name).map(value => ({ name, value })));
  if (present.length > 1) {
    throw new ApiError(400, "DUPLICATE_PARAMETER", `Use only one of ${names.join(", ")}.`);
  }
  if (present.length === 0 || present[0].value.trim() === "") {
    if (required) throw new ApiError(400, "MISSING_PARAMETER", `${names[0]} is required.`);
    return fallback;
  }
  return present[0].value.trim();
}

export function assertOnlyParams(params, allowedNames) {
  const allowed = new Set(allowedNames);
  for (const name of params.keys()) {
    if (!allowed.has(name)) {
      throw new ApiError(400, "UNKNOWN_PARAMETER", `${name} is not a supported parameter.`);
    }
  }
}

export function validateAddress(value, label = "address") {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new ApiError(
      400,
      "INVALID_ADDRESS",
      `${label} must be a 2-128 character contract address without spaces or URL characters.`,
    );
  }
  return value;
}

export function validateNetwork(value) {
  if (typeof value !== "string" || !NETWORK_RE.test(value)) {
    throw new ApiError(400, "INVALID_NETWORK", "network must be a valid GeckoTerminal network ID.");
  }
  return value;
}

export function parseBoundedInteger(value, label, min, max, fallback) {
  if (value === null || value === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ApiError(400, "INVALID_PARAMETER", `${label} must be a whole number.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ApiError(400, "INVALID_PARAMETER", `${label} must be between ${min} and ${max}.`);
  }
  return number;
}

export function addressesEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (HEX_ADDRESS_RE.test(left) && HEX_ADDRESS_RE.test(right)) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

export function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function safeUpstreamDetail(payload) {
  const raw = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || payload?.error;
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\r\n\t]+/g, " ").trim();
  return compact ? compact.slice(0, 180) : null;
}

function retryAfterHeader(response) {
  const value = response.headers.get("retry-after");
  return value && /^\d{1,5}$/.test(value) ? { "Retry-After": value } : {};
}

export async function geckoFetch(path, params = {}) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new ApiError(500, "INVALID_UPSTREAM_PATH", "The upstream request path is invalid.");
  }

  const url = new URL(`${GECKO_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  let payload = null;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json;version=20230203" },
    });
    try {
      payload = await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (response.ok) {
        throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "GeckoTerminal returned invalid JSON.");
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") {
      throw new ApiError(504, "UPSTREAM_TIMEOUT", "GeckoTerminal took too long to respond.");
    }
    throw new ApiError(502, "UPSTREAM_UNREACHABLE", "Could not reach GeckoTerminal.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = safeUpstreamDetail(payload);
    if (response.status === 429) {
      throw new ApiError(
        429,
        "UPSTREAM_RATE_LIMITED",
        detail || "GeckoTerminal rate limit reached. Try again shortly.",
        retryAfterHeader(response),
      );
    }
    if (response.status === 404) {
      throw new ApiError(404, "UPSTREAM_NOT_FOUND", detail || "GeckoTerminal could not find that resource.");
    }
    if (response.status >= 500) {
      throw new ApiError(502, "UPSTREAM_UNAVAILABLE", detail || "GeckoTerminal is temporarily unavailable.");
    }
    throw new ApiError(502, "UPSTREAM_REJECTED_REQUEST", detail || "GeckoTerminal rejected the data request.");
  }

  return payload;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export function guardGetRequest(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET requests are supported." } },
      { status: 405, headers: { Allow: "GET, OPTIONS" } },
    );
  }
  return null;
}

export function jsonResponse(data, { status = 200, cacheSeconds = 0, staleSeconds, headers = {} } = {}) {
  const cacheControl = cacheSeconds > 0
    ? `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds ?? cacheSeconds * 2}`
    : "no-store";
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...headers,
    },
  });
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: error.headers },
    );
  }
  console.error("On-chain API error:", error?.message || error);
  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}

export function includedResources(payload) {
  const map = new Map();
  for (const resource of Array.isArray(payload?.included) ? payload.included : []) {
    if (resource && typeof resource.id === "string" && typeof resource.type === "string") {
      map.set(`${resource.type}:${resource.id}`, resource);
    }
  }
  return map;
}

function relatedResource(pool, relationship, included) {
  const ref = pool?.relationships?.[relationship]?.data;
  if (!ref || typeof ref.id !== "string" || typeof ref.type !== "string") return { ref: null, resource: null };
  return { ref, resource: included.get(`${ref.type}:${ref.id}`) || null };
}

function networkFromExactTokenId(resourceId, address) {
  if (typeof resourceId !== "string" || resourceId.length <= address.length + 1) return null;
  const separator = resourceId.length - address.length - 1;
  if (resourceId[separator] !== "_") return null;
  const idAddress = resourceId.slice(separator + 1);
  const network = resourceId.slice(0, separator);
  return addressesEqual(idAddress, address) && NETWORK_RE.test(network) ? network : null;
}

function exactTokenSide(pool, included, address) {
  for (const side of ["base", "quote"]) {
    const { ref, resource } = relatedResource(pool, `${side}_token`, included);
    if (!ref) continue;
    const includedAddress = resource?.attributes?.address;
    const exact = typeof includedAddress === "string"
      ? addressesEqual(includedAddress, address)
      : Boolean(networkFromExactTokenId(ref.id, address));
    if (exact) return { side, ref, resource, network: networkFromExactTokenId(ref.id, address) };
  }
  return null;
}

function normalizedToken(resource, fallbackAddress) {
  const attributes = resource?.attributes || {};
  return {
    address: typeof attributes.address === "string" ? attributes.address : fallbackAddress,
    name: typeof attributes.name === "string" ? attributes.name : null,
    symbol: typeof attributes.symbol === "string" ? attributes.symbol : null,
    decimals: Number.isInteger(attributes.decimals) ? attributes.decimals : null,
    image: typeof attributes.image_url === "string" ? attributes.image_url : null,
  };
}

function compactCounterToken(resource, fallbackAddress) {
  const token = normalizedToken(resource, fallbackAddress);
  return { address: token.address, name: token.name, symbol: token.symbol };
}

function transactionCount(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.trunc(number) : null;
}

export function poolCandidate(pool, included, address, requiredNetwork = null) {
  if (!pool || pool.type !== "pool") return null;
  const match = exactTokenSide(pool, included, address);
  if (!match?.network || (requiredNetwork && match.network !== requiredNetwork)) return null;

  const attributes = pool.attributes || {};
  const poolAddress = attributes.address;
  if (typeof poolAddress !== "string" || !ADDRESS_RE.test(poolAddress)) return null;

  const otherSide = match.side === "base" ? "quote" : "base";
  const other = relatedResource(pool, `${otherSide}_token`, included);
  const dex = relatedResource(pool, "dex", included);
  const liquidityUsd = nonNegativeNumber(attributes.reserve_in_usd);
  const volume24h = nonNegativeNumber(attributes.volume_usd?.h24);
  const sidePrice = match.side === "base" ? attributes.base_token_price_usd : attributes.quote_token_price_usd;
  const priceUsd = finiteNumber(attributes.token_price_usd) ?? finiteNumber(sidePrice);
  // Generic pool search reports base-token cap/change fields. Only expose those
  // for a quote-side match when the token-specific price field proves the
  // upstream response was explicitly oriented to the requested token.
  const hasTokenOrientation = attributes.token_price_usd !== null
    && attributes.token_price_usd !== undefined;
  const marketFieldsMatchToken = match.side === "base" || hasTokenOrientation;
  const transactions = attributes.transactions?.h24 || {};
  const transactions24h = {
    buys: transactionCount(transactions.buys),
    sells: transactionCount(transactions.sells),
    buyers: transactionCount(transactions.buyers),
    sellers: transactionCount(transactions.sellers),
  };

  return {
    active: liquidityUsd !== null && liquidityUsd > 0 && priceUsd !== null && priceUsd > 0,
    asset: {
      network: match.network,
      poolAddress,
      tokenSide: match.side,
      dex: {
        id: dex.ref?.id || null,
        name: typeof dex.resource?.attributes?.name === "string" ? dex.resource.attributes.name : null,
      },
      token: normalizedToken(match.resource, address),
      counterToken: compactCounterToken(other.resource, other.resource?.attributes?.address || null),
      market: {
        priceUsd,
        liquidityUsd,
        volume24h,
        marketCapUsd: marketFieldsMatchToken ? nonNegativeNumber(attributes.market_cap_usd) : null,
        fdvUsd: marketFieldsMatchToken ? nonNegativeNumber(attributes.fdv_usd) : null,
        change24h: marketFieldsMatchToken ? finiteNumber(attributes.price_change_percentage?.h24) : null,
        poolCreatedAt: typeof attributes.pool_created_at === "string" ? attributes.pool_created_at : null,
        transactions24h,
      },
      sourceUrl: `https://www.geckoterminal.com/${encodeURIComponent(match.network)}/pools/${encodeURIComponent(poolAddress)}`,
    },
  };
}

export function collectPoolCandidates(payload, address, requiredNetwork = null) {
  const included = includedResources(payload);
  const candidates = [];
  for (const pool of Array.isArray(payload?.data) ? payload.data : []) {
    const candidate = poolCandidate(pool, included, address, requiredNetwork);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export function rankActivePools(candidates) {
  return candidates
    .filter(candidate => candidate.active)
    .sort((left, right) => {
      const liquidity = (right.asset.market.liquidityUsd || 0) - (left.asset.market.liquidityUsd || 0);
      if (liquidity !== 0) return liquidity;
      const volume = (right.asset.market.volume24h || 0) - (left.asset.market.volume24h || 0);
      if (volume !== 0) return volume;
      return `${left.asset.network}:${left.asset.poolAddress}`.localeCompare(`${right.asset.network}:${right.asset.poolAddress}`);
    });
}

export function dedupeAssets(assets) {
  const seen = new Set();
  return assets.filter(asset => {
    const pool = HEX_ADDRESS_RE.test(asset.poolAddress) ? asset.poolAddress.toLowerCase() : asset.poolAddress;
    const key = `${asset.network}:${pool}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function geckoBaseUrl() {
  return GECKO_BASE;
}
