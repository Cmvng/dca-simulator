async function getJson(url, { signal } = {}) {
  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (fetchError) {
    // Aborts must keep their name so callers can ignore them; every other
    // network failure gets a human-readable message instead of a raw TypeError.
    if (fetchError?.name === "AbortError") throw fetchError;
    const error = new Error("The market-data service could not be reached. Check your connection and try again.");
    error.code = "NETWORK_ERROR";
    throw error;
  }

  let payload = null;
  let parsed = false;
  try {
    payload = await response.json();
    parsed = true;
  } catch (parseError) {
    if (parseError?.name === "AbortError") throw parseError;
  }

  if (!response.ok) {
    const message = typeof payload?.error === "string"
      ? payload.error
      : payload?.error?.message || "The market-data request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.details;
    throw error;
  }
  if (!parsed || payload === null || typeof payload !== "object") {
    // A 200 with a non-JSON body (proxy/captive portal, truncated transfer)
    // must not reach callers as null and surface as a TypeError.
    const error = new Error("The market-data response was invalid. Please try again.");
    error.status = response.status;
    error.code = "INVALID_RESPONSE";
    throw error;
  }
  return payload;
}

export function resolveContract(address, { signal } = {}) {
  return getJson(`/api/token?address=${encodeURIComponent(address.trim())}`, { signal });
}

export function getPoolCandles(asset, timeframe, { signal } = {}) {
  const params = new URLSearchParams({
    network: asset.network,
    pool: asset.poolAddress,
    token: asset.token.address,
    timeframe: timeframe.timeframe,
    aggregate: String(timeframe.aggregate),
    limit: String(timeframe.limit),
  });
  return getJson(`/api/candles?${params}`, { signal });
}
