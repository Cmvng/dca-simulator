// Contract-analyzer browser smoke with deterministic mocked provider data.
// Expects `dist/` from `npm run build`; starts the standalone server itself.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const PORT = 4518;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SCREENSHOT_DIR = process.env.SCRATCH || tmpdir();
const CONTRACT = "0x1111111111111111111111111111111111111111";
const BAD_CONTRACT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const POOL_A = "0x2222222222222222222222222222222222222222";
const POOL_B = "0x4444444444444444444444444444444444444444";
const AS_OF = "2026-08-30T12:00:00.000Z";
const AS_OF_SECONDS = Date.parse(AS_OF) / 1000;

const candles = Array.from({ length: 120 }, (_, index) => {
  const trend = 1 + index * 0.0015;
  const open = trend + Math.sin((index - 1) / 5) * 0.045;
  const close = trend + Math.sin(index / 5) * 0.045;
  return {
    time: AS_OF_SECONDS - ((119 - index) * 14_400),
    open,
    high: Math.max(open, close) * 1.018,
    low: Math.min(open, close) * 0.982,
    close,
    volume: 18_000 + index * 75,
  };
});
const shortDailyCandles = candles.slice(0, 26).map((candle, index) => ({
  ...candle,
  time: AS_OF_SECONDS - ((25 - index) * 86_400),
}));

function asset(poolAddress, liquidityUsd) {
  return {
    network: "base",
    poolAddress,
    tokenSide: "base",
    dex: { id: "smoke-dex", name: "Smoke DEX" },
    token: {
      address: CONTRACT,
      name: "Smoke Token",
      symbol: "SMOKE",
      decimals: 18,
      image: null,
    },
    counterToken: {
      address: "0x3333333333333333333333333333333333333333",
      name: "USD Coin",
      symbol: "USDC",
    },
    market: {
      priceUsd: candles.at(-1).close,
      liquidityUsd,
      volume24h: 250_000,
      marketCapUsd: 2_000_000,
      fdvUsd: 2_500_000,
      change24h: 2.5,
      poolCreatedAt: "2024-01-01T00:00:00.000Z",
      transactions24h: { buys: 123, sells: 89, buyers: 101, sellers: 77 },
    },
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Standalone server did not become ready.");
}

const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

let browser;
let lastCandleUrl = null;
const consoleErrors = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};

try {
  await waitForServer();
  if (!existsSync(CHROME)) {
    throw new Error(`Chromium executable not found at ${CHROME}. Set CHROME_PATH to an installed Chromium build.`);
  }

  browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**fonts.googleapis.com/**", route => route.abort());
  await context.route(/\/api\/token(?:\?.*)?$/, route => {
    const address = new URL(route.request().url()).searchParams.get("address");
    if (address === BAD_CONTRACT) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TOKEN_NOT_FOUND", message: "Smoke token was not found." },
        }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        asOf: AS_OF,
        provider: "GeckoTerminal",
        asset: asset(POOL_A, 500_000),
        alternatives: [asset(POOL_B, 300_000)],
      }),
    });
  });
  await context.route(/\/api\/candles(?:\?.*)?$/, route => {
    lastCandleUrl = new URL(route.request().url());
    if (
      lastCandleUrl.searchParams.get("timeframe") === "hour"
      && lastCandleUrl.searchParams.get("aggregate") === "1"
    ) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SMOKE_CANDLE_ERROR", message: "Smoke candles are unavailable." },
        }),
      });
    }
    const responseCandles = lastCandleUrl.searchParams.get("timeframe") === "day"
      ? shortDailyCandles
      : candles;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        asOf: AS_OF,
        provider: "GeckoTerminal",
        network: "base",
        poolAddress: lastCandleUrl.searchParams.get("pool"),
        timeframe: lastCandleUrl.searchParams.get("timeframe"),
        aggregate: Number(lastCandleUrl.searchParams.get("aggregate")),
        candles: responseCandles,
      }),
    });
  });

  const page = await context.newPage();
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(`PAGEERROR: ${error.message}`));

  await step("contract analyzer renders a real chart canvas", async () => {
    await page.goto(`${BASE}/contract`, { waitUntil: "domcontentloaded" });
    await page.fill("#contract-address", CONTRACT);
    await page.click('.contract-form button[type="submit"]');
    await page.waitForSelector(".token-workspace");
    await page.waitForFunction(() => document.querySelector(".cmvng-dca-chart__source")?.textContent.includes("120 candles"));
    await page.waitForSelector(".cmvng-dca-chart__canvas canvas");
    const legCount = await page.locator(".dca-leg").count();
    if (legCount !== 4) throw new Error(`expected 4 plan legs, found ${legCount}`);
    const executionCount = await page.locator(".execution-step--buy").count();
    if (executionCount !== 4) throw new Error(`expected 4 always-visible execution steps, found ${executionCount}`);
    for (const markerId of ["B1", "B2", "B3", "B4", "S1", "X1"]) {
      await page.waitForSelector(`[data-marker-id="${markerId}"]:not([hidden])`);
    }
    if (!(await page.textContent(".execution-map")).includes("S1 conditional exit")) {
      throw new Error("conditional S1 execution copy is missing");
    }
    const executionText = await page.textContent(".execution-map");
    if (!executionText.includes("30-day review") || !executionText.includes("Review by")) {
      throw new Error("monitoring/review window is missing");
    }
    if (await page.locator(".timeframe-control button").count() !== 5) {
      throw new Error("timeframe controls should expose five distinct candle resolutions");
    }
    if (await page.locator('.timeframe-control button:has-text("MAX")').count()) {
      throw new Error("duplicate MAX timeframe is still present");
    }
    const box = await page.locator(".cmvng-dca-chart__canvas canvas").first().boundingBox();
    if (!box || box.width < 100 || box.height < 100) throw new Error("chart canvas has no usable dimensions");
    if (lastCandleUrl?.searchParams.get("aggregate") !== "4") throw new Error("default 4-hour request was not sent");
    const analyzerUrl = new URL(page.url());
    if (analyzerUrl.searchParams.get("address") !== CONTRACT || analyzerUrl.searchParams.get("interval") !== "4h") {
      throw new Error("contract and interval were not persisted in the URL");
    }
    if (consoleErrors.length) throw new Error(consoleErrors.join(" | "));
  });

  await step("alternative pool reloads candles", async () => {
    const nextRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/candles" && url.searchParams.get("pool") === POOL_B;
    });
    await page.selectOption("#pool-source", `base:${POOL_B}`);
    await nextRequest;
    if (lastCandleUrl?.searchParams.get("pool") !== POOL_B) throw new Error("alternative pool was not requested");
    if (new URL(page.url()).searchParams.get("pool") !== `base:${POOL_B}`) throw new Error("selected pool was not persisted in the URL");
  });

  await step("contract route has no mobile overflow", async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px at ${width}px`);
      const chartTop = (await page.locator(".chart-panel").boundingBox())?.y;
      const settingsTop = (await page.locator(".strategy-panel").boundingBox())?.y;
      if (!(chartTop < settingsTop)) throw new Error("chart does not precede plan settings on mobile");
    }
    await page.screenshot({ path: join(SCREENSHOT_DIR, "cmvng-contract-mobile.png"), fullPage: false });
  });

  await step("26 daily candles build a labeled volatility-reference plan", async () => {
    await page.click('.timeframe-control button:has-text("1D")');
    await page.waitForFunction(() => document.querySelector(".cmvng-dca-chart__source")?.textContent.includes("26 candles"));
    await page.waitForSelector('[data-marker-id="S1"]:not([hidden])');
    const settingsText = await page.textContent(".strategy-panel");
    if (!settingsText.includes("Volatility-reference ladder")) throw new Error("short-history plan mode is not clearly labeled");
    if (settingsText.includes("Plan blocked")) throw new Error("26 daily candles incorrectly blocked the plan");
    if (new URL(page.url()).searchParams.get("interval") !== "1d") throw new Error("daily interval was not persisted in the URL");
  });

  await step("decimal budgets are preserved", async () => {
    const budget = page.locator('input[aria-label="Total simulation budget in US dollars"]');
    await budget.fill("500.50");
    await page.locator(".strategy-panel__heading").click();
    if (await budget.inputValue() !== "500.5") throw new Error("decimal budget was not preserved");
  });

  await step("contract, pool, and interval survive reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector(".cmvng-dca-chart__source")?.textContent.includes("26 candles"));
    if (await page.locator("#pool-source").inputValue() !== `base:${POOL_B}`) throw new Error("pool selection was not restored");
    if ((await page.locator('.timeframe-control button:has-text("1D")').getAttribute("aria-pressed")) !== "true") throw new Error("interval was not restored");
    await page.waitForSelector('[data-marker-id="S1"]:not([hidden])');
  });

  await step("timeframe errors stay inside the chart", async () => {
    await page.click('.timeframe-control button:has-text("1H")');
    const selector = '.cmvng-dca-chart__state[role="alert"]';
    await page.waitForSelector(selector);
    const text = await page.textContent(selector);
    if (!text.includes("Smoke candles are unavailable.")) throw new Error("missing candle error message");
  });

  await step("contract-resolution errors replace stale results", async () => {
    await page.fill("#contract-address", BAD_CONTRACT);
    await page.click('.contract-form button[type="submit"]');
    const selector = '.inline-alert[role="alert"]';
    await page.waitForSelector(selector);
    const text = await page.textContent(selector);
    if (!text.includes("Smoke token was not found.")) throw new Error("missing resolution error message");
    if (await page.locator(".token-workspace").count()) throw new Error("stale token results remained visible");
  });

  await context.close();
} finally {
  await browser?.close();
  server.kill();
}

console.log(process.exitCode ? "onchain smoke FAILED" : "onchain smoke passed");
