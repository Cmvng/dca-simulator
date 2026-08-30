import {
  ApiError,
  assertOnlyParams,
  collectPoolCandidates,
  dedupeAssets,
  errorResponse,
  geckoFetch,
  getSingleParam,
  guardGetRequest,
  jsonResponse,
  rankActivePools,
  requestUrl,
  validateAddress,
  validateNetwork,
} from "./_onchain.js";

const INCLUDED = "base_token,quote_token,dex";

export default async function handler(req) {
  const guarded = guardGetRequest(req);
  if (guarded) return guarded;

  try {
    const { searchParams } = requestUrl(req);
    assertOnlyParams(searchParams, ["address", "network"]);
    const address = validateAddress(getSingleParam(searchParams, "address", { required: true }), "address");
    const networkParam = getSingleParam(searchParams, "network");
    const networkHint = networkParam ? validateNetwork(networkParam) : null;

    // Search is used only to discover pools whose base/quote relationship exactly
    // matches the pasted address; fuzzy name/symbol matches are discarded.
    const searchPayload = await geckoFetch("/search/pools", {
      query: address,
      network: networkHint,
      include: INCLUDED,
      page: 1,
    });
    const exactSearchPools = collectPoolCandidates(searchPayload, address, networkHint);
    if (exactSearchPools.length === 0) {
      throw new ApiError(404, "TOKEN_NOT_FOUND", "No pool exactly matching that token address was found.");
    }

    const rankedSearchPools = rankActivePools(exactSearchPools);
    if (rankedSearchPools.length === 0) {
      throw new ApiError(422, "NO_ACTIVE_POOL", "The token has no active pool with a valid price and liquidity.");
    }

    // Search returns up to 20 exact related pools across indexed networks. Rank
    // once to keep contract resolution fast and within the public rate limit.
    const selected = rankedSearchPools[0].asset;
    const alternatives = dedupeAssets(rankedSearchPools.slice(1).map(candidate => candidate.asset))
      .filter(asset => !(asset.network === selected.network && asset.poolAddress === selected.poolAddress))
      .slice(0, 8);

    return jsonResponse({
      asset: selected,
      alternatives,
      asOf: new Date().toISOString(),
      provider: "GeckoTerminal",
    }, { cacheSeconds: 60, staleSeconds: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = { runtime: "edge" };
