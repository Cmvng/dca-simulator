// Smoke test: drive the built app with mocked /api/coins responses.
import { chromium } from "playwright-core";

const BASE = "http://localhost:4173";

// deterministic fixtures
function makePrices(days = 365) {
  let s = 42, price = 60000;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const out = [];
  const t0 = Date.now() - days * 86400000;
  for (let i = 0; i < days; i++) { price *= 1 + (rnd() - 0.492) * 0.05; out.push([t0 + i * 86400000, price]); }
  return out;
}
const COINS = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", image: null, current_price: 65000, price_change_percentage_24h: 2.4, market_cap_rank: 1, market_cap: 1.2e12 },
  { id: "ethereum", symbol: "eth", name: "Ethereum", image: null, current_price: 3200, price_change_percentage_24h: -1.1, market_cap_rank: 2, market_cap: 4e11 },
  { id: "solana", symbol: "sol", name: "Solana", image: null, current_price: 150, price_change_percentage_24h: 6.2, market_cap_rank: 5, market_cap: 7e10 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

await page.route("**/api/coins*", route => {
  const url = new URL(route.request().url());
  const type = url.searchParams.get("type");
  let body;
  if (type === "list") body = { fetchedAt: Date.now(), coins: COINS };
  else if (type === "history") body = { prices: makePrices(), fetchedAt: Date.now() };
  else if (type === "price") {
    const id = url.searchParams.get("id");
    body = { fetchedAt: Date.now(), data: { [id]: { usd: 65000, usd_24h_change: 2.4 } } };
  } else body = {};
  route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
});

const step = async (name, fn) => {
  try { await fn(); console.log("OK  " + name); }
  catch (e) { console.log("FAIL " + name + ": " + e.message.split("\n")[0]); process.exitCode = 1; }
};

await step("load app", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#coin-search", { timeout: 10000 });
});

await step("select bitcoin", async () => {
  await page.click("#coin-search");
  await page.fill("#coin-search", "bit");
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await page.click('[role="option"]');
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("model score"), { timeout: 8000 });
});

await step("schedule preview updates instantly", async () => {
  await page.waitForFunction(() => document.body.innerText.includes("Your plan".toUpperCase()) || document.body.innerText.toLowerCase().includes("your plan"), { timeout: 3000 });
});

await step("run scenario simulation", async () => {
  await page.click('button:has-text("Show Me the Numbers")');
  await page.waitForSelector('section[aria-label="Your simulated outcome"]', { timeout: 15000 });
});

await step("results sections render", async () => {
  for (const text of ["Reality check", "best, median, worst", "lump sum", "Risk", "Purchase timeline", "How CMVNG calculates this"]) {
    const found = await page.evaluate(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), text);
    if (!found) throw new Error("missing section: " + text);
  }
});

await step("share panel renders (lazy)", async () => {
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("share your plan"), { timeout: 8000 });
});

await step("generate share card", async () => {
  await page.click('button:has-text("Generate My Card")');
  await page.waitForSelector('img[alt*="Share card preview"]', { timeout: 10000 });
});

await step("save plan", async () => {
  await page.click('button:has-text("Save this plan")');
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("plan saved"), { timeout: 5000 });
});

await step("purchase timeline opens", async () => {
  await page.click('button:has-text("Purchase timeline")');
  await page.waitForSelector("table", { timeout: 5000 });
});

await page.screenshot({ path: process.env.SCRATCH + "/desktop-results.png", fullPage: false });

await step("backtest mode runs", async () => {
  await page.click('button:has-text("Historical backtest")');
  await page.click('button:has-text("Run Historical Backtest")');
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("what actually happened"), { timeout: 15000 });
});

await page.screenshot({ path: process.env.SCRATCH + "/desktop-backtest.png" });

// mobile pass
await step("mobile 320px: no horizontal scroll, results legible", async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.click('button:has-text("Scenario simulation")');
  await page.click('button:has-text("Show Me the Numbers")');
  await page.waitForSelector('section[aria-label="Your simulated outcome"]', { timeout: 15000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px at 320px`);
});
await page.screenshot({ path: process.env.SCRATCH + "/mobile-320.png" });

await step("mobile 390px: no horizontal scroll", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px`);
});

await step("saved plans panel opens", async () => {
  await page.click('button:has-text("My plans")');
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("my saved plans"), { timeout: 5000 });
});

console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No console errors.");
await browser.close();
