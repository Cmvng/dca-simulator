async function getJson(url, { signal } = {}) {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
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
