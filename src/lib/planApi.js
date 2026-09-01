// Client for server-stored public plans (/plan/<id> short links).
// Talks to /api/plans (api/plans.js — node server or vite dev middleware).
//
// The owner token returned by publishPlan is the revocation capability. It is
// kept ONLY in this browser's localStorage (cmv_plan_tokens) — losing it means
// the plan can no longer be removed from this device, which is why callers
// should surface the public URL immediately after publishing.
//
// On static hosting without the node server (e.g. plain Vercel static deploy)
// the endpoint does not exist; publishPlan/fetchPlan then resolve to
// { unavailable: true } so the UI can fall back to hash links gracefully.

const ENDPOINT = "/api/plans";
const TOKENS_KEY = "cmv_plan_tokens";
const MAX_TOKENS = 50;

// ── owner-token storage ──────────────────────────────────────────────────────

function readTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKENS_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTokens(map) {
  try { localStorage.setItem(TOKENS_KEY, JSON.stringify(map)); } catch { }
}

export function rememberToken(id, token) {
  const map = readTokens();
  delete map[id]; // re-insert so the freshest entries survive the cap
  map[id] = token;
  const ids = Object.keys(map);
  while (ids.length > MAX_TOKENS) delete map[ids.shift()];
  writeTokens(map);
}

export function getToken(id) {
  return readTokens()[id] || null;
}

export function forgetToken(id) {
  const map = readTokens();
  if (id in map) {
    delete map[id];
    writeTokens(map);
  }
}

// ── fetch helpers ────────────────────────────────────────────────────────────

// Static hosting without the node server 404s with an HTML page; our API
// always answers JSON. A non-JSON 404/405 therefore means "no plans backend".
function endpointMissing(res) {
  if (res.status !== 404 && res.status !== 405) return false;
  return !(res.headers.get("content-type") || "").includes("application/json");
}

async function jsonOrNull(res) {
  try { return await res.json(); } catch { return null; }
}

function networkError() {
  return new Error("Network problem — check your connection.");
}

// ── API ──────────────────────────────────────────────────────────────────────

// publishPlan(config) → { id, ownerToken, url } | { unavailable: true }.
// Remembers the owner token locally so the plan can be revoked from here.
export async function publishPlan(config) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  } catch {
    throw networkError();
  }
  if (endpointMissing(res)) return { unavailable: true };
  if (res.status === 429) {
    throw new Error("Too many plans published from this connection — try again in an hour.");
  }
  const json = await jsonOrNull(res);
  if (!res.ok || !json?.id || !json?.ownerToken) {
    throw new Error(json?.error || "Could not publish the plan. Try again in a moment.");
  }
  rememberToken(json.id, json.ownerToken);
  return { id: json.id, ownerToken: json.ownerToken, url: `${window.location.origin}/plan/${json.id}` };
}

// fetchPlan(id) → { id, createdAt, modelVersion, config } | null (unknown or
// revoked) | { unavailable: true } (no plans backend on this host).
export async function fetchPlan(id) {
  let res;
  try {
    res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`);
  } catch {
    throw networkError();
  }
  if (endpointMissing(res)) return { unavailable: true };
  if (res.status === 404) return null;
  const json = await jsonOrNull(res);
  if (!res.ok || !json?.config) {
    throw new Error(json?.error || "Could not load this plan. Try again in a moment.");
  }
  return json;
}

// revokePlan(id, token?) → true when removed (token defaults to the one
// remembered at publish time; the local token is forgotten on success).
// The token travels in a header, never the URL — query strings end up in
// access logs and proxies, which would leak the revocation capability.
export async function revokePlan(id, token = getToken(id)) {
  if (!token) return false;
  let res;
  try {
    res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-cmvng-owner-token": token },
    });
  } catch {
    throw networkError();
  }
  if (endpointMissing(res)) return false;
  const json = await jsonOrNull(res);
  if (res.ok && json?.revoked) {
    forgetToken(id);
    return true;
  }
  return false;
}
