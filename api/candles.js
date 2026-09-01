import {
  ApiError,
  assertOnlyParams,
  addressesEqual,
  errorResponse,
  finiteNumber,
  geckoFetch,
  getAliasedParam,
  getSingleParam,
  guardGetRequest,
  jsonResponse,
  parseBoundedInteger,
  requestUrl,
  validateAddress,
  validateNetwork,
} from "./_onchain.js";

const AGGREGATES = {
  minute: new Set([1, 5, 15]),
  hour: new Set([1, 4, 12]),
  day: new Set([1]),
};

function validateTimeframe(value) {
  if (!Object.hasOwn(AGGREGATES, value)) {
    throw new ApiError(400, "INVALID_TIMEFRAME", "timeframe must be minute, hour, or day.");
  }
  return value;
}

function validateAggregate(value, timeframe) {
  const aggregate = parseBoundedInteger(value, "aggregate", 1, 15, 1);
  if (!AGGREGATES[timeframe].has(aggregate)) {
    throw new ApiError(
      400,
      "INVALID_AGGREGATE",
      `aggregate ${aggregate} is not supported for ${timeframe} candles.`,
    );
  }
  return aggregate;
}

function tokenMeta(payload, address) {
  const meta = payload?.meta || {};
  const base = meta.base || {};
  const quote = meta.quote || {};
  if (addressesEqual(base.address, address)) return { side: "base", base, quote };
  if (addressesEqual(quote.address, address)) return { side: "quote", base, quote };
  throw new ApiError(422, "TOKEN_NOT_IN_POOL", "The token address is not an exact base or quote token in this pool.");
}

function normalizedCandles(payload) {
  const raw = payload?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(raw)) {
    throw new ApiError(502, "UPSTREAM_INVALID_RESPONSE", "GeckoTerminal returned no OHLCV list.");
  }

  const byTimestamp = new Map();
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = finiteNumber(row[0]);
    const open = finiteNumber(row[1]);
    const high = finiteNumber(row[2]);
    const low = finiteNumber(row[3]);
    const close = finiteNumber(row[4]);
    const volume = finiteNumber(row[5]);
    const valid = Number.isInteger(time) && time > 0
      && open !== null && open > 0
      && high !== null && high > 0
      && low !== null && low > 0
      && close !== null && close > 0
      && volume !== null && volume >= 0
      && high >= Math.max(open, close, low)
      && low <= Math.min(open, close, high);
    if (valid && !byTimestamp.has(time)) {
      byTimestamp.set(time, { time, open, high, low, close, volume });
    }
  }

  const candles = [...byTimestamp.values()].sort((left, right) => left.time - right.time);
  if (candles.length === 0) {
    throw new ApiError(502, "UPSTREAM_INVALID_CANDLES", "GeckoTerminal returned no valid candles for this pool.");
  }
  return candles;
}

export default async function handler(req) {
  const guarded = guardGetRequest(req);
  if (guarded) return guarded;

  try {
    const { searchParams } = requestUrl(req);
    assertOnlyParams(searchParams, [
      "network", "poolAddress", "pool", "tokenAddress", "token", "address",
      "timeframe", "aggregate", "limit",
    ]);
    const network = validateNetwork(getSingleParam(searchParams, "network", { required: true }));
    const poolAddress = validateAddress(
      getAliasedParam(searchParams, ["poolAddress", "pool"], { required: true }),
      "poolAddress",
    );
    const tokenAddress = validateAddress(
      getAliasedParam(searchParams, ["tokenAddress", "token", "address"], { required: true }),
      "tokenAddress",
    );
    const timeframe = validateTimeframe(getSingleParam(searchParams, "timeframe", { fallback: "hour" }));
    const aggregate = validateAggregate(getSingleParam(searchParams, "aggregate"), timeframe);
    const limit = parseBoundedInteger(getSingleParam(searchParams, "limit"), "limit", 1, 1000, 300);

    const payload = await geckoFetch(
      `/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}`,
      {
        aggregate,
        limit,
        currency: "usd",
        token: tokenAddress,
        include_empty_intervals: "false",
      },
    );

    // GeckoTerminal echoes pool token metadata; require an exact relationship so
    // an invalid token can never silently fall back to the pool's default side.
    tokenMeta(payload, tokenAddress);
    const candles = normalizedCandles(payload);
    // GeckoTerminal's public OHLCV data is cached for one minute upstream.
    const cacheSeconds = timeframe === "day" ? 300 : 60;

    return jsonResponse({
      candles,
      asOf: new Date().toISOString(),
      provider: "GeckoTerminal",
      poolAddress,
      network,
      timeframe,
      aggregate,
    }, { cacheSeconds, staleSeconds: cacheSeconds * 2 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = { runtime: "edge" };
