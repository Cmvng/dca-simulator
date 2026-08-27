// Public-plan lifecycle e2e: create → view → auto-simulate → revoke → 404.
// Self-contained: builds nothing (expects dist/ from `npm run build`), spawns
// server.js on a throwaway port with a temp PLANS_DIR, drives it with
// playwright-core, then tears everything down. /api/coins is mocked so the
// run never touches CoinGecko. Usage: `npm run build && node tools/plans-e2e.mjs`.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const PORT = 4517;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

function makePrices(days = 365) {
  let s = 42, price = 60000;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const out = []; const t0 = Date.now() - days * 86400000;
  for (let i = 0; i < days; i++) { price *= 1 + (rnd() - 0.492) * 0.05; out.push([t0 + i * 86400000, price]); }
  return out;
}
const COINS = [{ id: "bitcoin", symbol: "btc", name: "Bitcoin", image: null, current_price: 65000, price_change_percentage_24h: 2.4, market_cap_rank: 1, market_cap: 1.2e12 }];

async function mockCoins(ctx) {
  await ctx.route("**fonts.googleapis.com/**", r => r.abort());
  await ctx.route("**/api/coins*", r => {
    const url = new URL(r.request().url());
    const type = url.searchParams.get("type");
    let body;
    if (type === "list") body = { fetchedAt: Date.now(), coins: COINS };
    else if (type === "history") body = { prices: makePrices(), fetchedAt: Date.now() };
    else if (type === "price") body = { fetchedAt: Date.now(), data: { [url.searchParams.get("id")]: { usd: 65000, usd_24h_change: 2.4 } } };
    else body = {};
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), PLANS_DIR: mkdtempSync(join(tmpdir(), "cmvng-plans-")) },
  stdio: "ignore",
});
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch({ executablePath: CHROME });
const step = async (name, fn) => {
  try { await fn(); console.log("OK ", name); }
  catch (e) { console.log("FAIL", name, "—", e.message.split("\n")[0]); process.exitCode = 1; }
};

try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
  await mockCoins(ctx);
  const page = await ctx.newPage();
  let planUrl = null;

  await step("publish public link", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.click('button:has-text("btc")');
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("model score"));
    await page.click('button:has-text("Show me the numbers")');
    await page.waitForSelector('section[aria-label="Your simulated outcome"]', { timeout: 15000 });
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("share your plan"));
    await page.click('button:has-text("Create public link")');
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("public link"), null, { timeout: 8000 });
    const tokens = await page.evaluate(() => JSON.parse(localStorage.getItem("cmv_plan_tokens") || "{}"));
    const id = Object.keys(tokens)[0];
    if (!id) throw new Error("no plan id stored");
    planUrl = `${BASE}/plan/${id}`;
  });

  await step("public page renders read-only and auto-simulates", async () => {
    await page.goto(planUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("shared plan"), null, { timeout: 10000 });
    await page.waitForSelector('section[aria-label="Your simulated outcome"]', { timeout: 20000 });
    if (await page.evaluate(() => !!document.querySelector("#coin-search"))) throw new Error("builder visible in public mode");
    if (!await page.evaluate(() => document.body.innerText.includes("Build your own plan"))) throw new Error("no build-your-own CTA");
  });

  await step("owner revoke removes the plan", async () => {
    await page.click('button:has-text("Remove this public plan")');
    await page.waitForSelector("#coin-search", { timeout: 10000 });
  });

  await step("revoked link shows honest notice to a fresh visitor", async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await mockCoins(ctx2);
    const p2 = await ctx2.newPage();
    await p2.goto(planUrl, { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => document.body.innerText.toLowerCase().includes("doesn't exist or was removed"), null, { timeout: 10000 });
    await ctx2.close();
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(process.exitCode ? "plans e2e FAILED" : "plans e2e passed");
