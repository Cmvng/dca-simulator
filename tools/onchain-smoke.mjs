// Scheduled-DCA contract-flow browser smoke with deterministic mocked provider data.
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
const AS_OF_SECONDS = Date.parse(AS_OF) / 1_000;

const fourHourCandles = Array.from({ length: 120 }, (_, index) => {
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

// Twenty-six real daily candles are intentionally enough for a volatility-based
// schedule. This protects the mobile bug that previously blocked plans below 30.
const dailyCandles = fourHourCandles.slice(0, 26).map((candle, index) => ({
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
      priceUsd: fourHourCandles.at(-1).close,
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

function requireQuery(url, expected) {
  const params = new URL(url).searchParams;
  for (const [key, value] of Object.entries(expected)) {
    if (params.get(key) !== String(value)) {
      throw new Error(`expected ${key}=${value}, received ${params.get(key)}`);
    }
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

let browser;
let lastCandleUrl = null;
let failHourlyCandles = false;
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
      failHourlyCandles
      && lastCandleUrl.searchParams.get("timeframe") === "hour"
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
      ? dailyCandles
      : fourHourCandles;
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

  const amount = page.getByLabel(/total (?:DCA )?(?:amount|budget)/i);
  const frequency = page.getByLabel(/buy every/i);
  const duration = page.getByLabel(/DCA duration in days/i);
  const target = page.getByLabel(/profit target/i);
  const generate = page.locator(".simple-plan-builder__submit");

  await step("contract opens one simple scheduled-DCA plan", async () => {
    await page.goto(`${BASE}/contract`, { waitUntil: "domcontentloaded" });
    await page.fill("#contract-address", CONTRACT);
    await page.click('.contract-form button[type="submit"]');
    await page.waitForSelector(".token-workspace");
    await frequency.waitFor();

    const optionValues = await frequency.locator("option").evaluateAll(options => options.map(option => option.value));
    if (optionValues.length !== 5) throw new Error(`expected 5 buy-frequency options, found ${optionValues.length}`);
    for (const value of ["1h", "6h", "12h", "daily", "weekly"]) {
      if (!optionValues.includes(value)) throw new Error(`missing ${value} buy-frequency option`);
    }

    await generate.click();
    await page.waitForSelector(".cmvng-scheduled-chart__canvas canvas", { timeout: 10_000 });
    await page.waitForSelector(".scheduled-plan-summary");

    if (await page.locator(".cmvng-scheduled-chart").count() !== 1) {
      throw new Error("the result should contain exactly one primary DCA chart");
    }
    if (await page.locator(".cmvng-plan-card, .plan-profile-selector").count()) {
      throw new Error("legacy plan-profile cards are still visible");
    }
    const technicalDetails = page.locator("details.simple-technical-details");
    if (await technicalDetails.count() !== 1 || await technicalDetails.getAttribute("open") !== null) {
      throw new Error("technical evidence should start inside one closed disclosure");
    }

    const bodyText = await page.locator("body").innerText();
    for (const jargon of ["B1–B4", "B1-B4", "S1", "X1"]) {
      if (bodyText.includes(jargon)) throw new Error(`legacy ${jargon} jargon is still visible`);
    }

    const chartCopy = await page.locator(".cmvng-scheduled-chart").innerText();
    if (!/not a (?:price )?forecast/i.test(chartCopy)) {
      throw new Error("the chart does not clearly label the volatility sample as not a forecast");
    }
    if (!/B · planned buy/i.test(chartCopy) || !/S · profit exit/i.test(chartCopy)) {
      throw new Error("the chart legend is missing clear buy and profit-exit markers");
    }
    const chartLabel = await page.locator(".cmvng-scheduled-chart__canvas").getAttribute("aria-label");
    if (!/planned buy markers/i.test(chartLabel || "")) {
      throw new Error("the chart does not expose its scheduled buys to assistive technology");
    }

    const valueButtons = page.locator('.value-mode-control button, [aria-label="Chart value unit"] button');
    if (await valueButtons.count() !== 3) throw new Error("Price / MCAP / FDV controls are incomplete");
    for (const label of ["Price", "MCAP", "FDV"]) {
      if (await valueButtons.filter({ hasText: label }).count() !== 1) {
        throw new Error(`missing ${label} value control`);
      }
    }

    const canvasBox = await page.locator(".cmvng-scheduled-chart__canvas canvas").first().boundingBox();
    if (!canvasBox || canvasBox.width < 100 || canvasBox.height < 100) {
      throw new Error("chart canvas has no usable dimensions");
    }
    requireQuery(page.url(), {
      address: CONTRACT,
      amount: 500,
      duration: 30,
      frequency: "daily",
      target: 100,
      unit: "marketCap",
      interval: "4h",
    });
    if (consoleErrors.length) throw new Error(consoleErrors.join(" | "));
  });

  await step("weekly plans work with 26 daily candles", async () => {
    await frequency.selectOption("weekly");
    const dailyRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/candles"
        && url.searchParams.get("timeframe") === "day"
        && url.searchParams.get("aggregate") === "1";
    });
    await generate.click();
    await dailyRequest;
    await page.waitForFunction(() => (
      new URL(window.location.href).searchParams.get("frequency") === "weekly"
      && document.querySelector(".scheduled-plan-summary")?.textContent.includes("Every week")
    ));
    if ((await page.locator(".simple-plan-builder").innerText()).includes("needs more price history")) {
      throw new Error("26 valid daily candles incorrectly blocked the schedule");
    }
    requireQuery(page.url(), { frequency: "weekly", interval: "1d" });
  });

  await step("amount, cadence, duration, target, and value unit persist", async () => {
    await amount.fill("500.50");
    await frequency.selectOption("6h");
    await duration.fill("60");
    await target.fill("100");
    const nextCandleRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/candles"
        && url.searchParams.get("timeframe") === "hour"
        && url.searchParams.get("aggregate") === "1";
    });
    await generate.click();
    await nextCandleRequest;
    await page.getByRole("button", { name: "FDV", exact: true }).first().click();
    await page.waitForSelector(".cmvng-scheduled-chart__canvas canvas");

    requireQuery(page.url(), {
      address: CONTRACT,
      amount: 500.5,
      duration: 60,
      frequency: "6h",
      target: 100,
      unit: "fdv",
      interval: "1h",
    });
    if (new URL(page.url()).searchParams.has("plan") || new URL(page.url()).searchParams.has("touches")) {
      throw new Error("legacy profile/touch state remains in the URL");
    }
    const summaryText = await page.locator(".scheduled-plan-summary").innerText();
    if (!/Every 6 hours/i.test(summaryText) || !/60 days/i.test(summaryText)) {
      throw new Error("the plain-language summary did not update to the chosen schedule");
    }
  });

  await step("alternative pool reloads data and survives the share card", async () => {
    await page.locator("details.simple-technical-details").evaluate(element => {
      element.open = true;
    });
    const nextRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/candles" && url.searchParams.get("pool") === POOL_B;
    });
    await page.selectOption("#pool-source", `base:${POOL_B}`);
    await nextRequest;
    if (lastCandleUrl?.searchParams.get("pool") !== POOL_B) {
      throw new Error("alternative pool was not requested");
    }
    await page.waitForFunction(expectedPool => (
      new URL(window.location.href).searchParams.get("pool") === expectedPool
      && document.querySelector(".cmvng-scheduled-chart__canvas canvas")
    ), `base:${POOL_B}`);
    requireQuery(page.url(), { pool: `base:${POOL_B}` });
    await page.locator("details.simple-technical-details").evaluate(element => {
      element.open = false;
    });

    const cardButton = page.getByRole("button", { name: /generate plan card/i });
    if (await cardButton.count() !== 1) throw new Error("Generate plan card action is missing");
    await cardButton.click();
    const preview = page.locator('img[alt*="scheduled DCA plan-card preview"]');
    await preview.waitFor({ timeout: 10_000 });
    if (!(await preview.getAttribute("src"))?.startsWith("data:image/png")) {
      throw new Error("generated plan card is not a PNG data URL");
    }
  });

  await step("scheduled-DCA controls and chart fit 320px and 390px", async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
      await settle(page);
      const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ));
      if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px at ${width}px`);

      const builderTop = (await amount.boundingBox())?.y;
      const chartTop = (await page.locator(".cmvng-scheduled-chart").boundingBox())?.y;
      if (!(Number.isFinite(builderTop) && Number.isFinite(chartTop) && builderTop < chartTop)) {
        throw new Error("amount, frequency, duration, and target must precede the chart on mobile");
      }
    }
    await page.screenshot({ path: join(SCREENSHOT_DIR, "cmvng-scheduled-contract-mobile.png"), fullPage: false });
  });

  await step("complete scheduled plan state survives reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cmvng-scheduled-chart__canvas canvas", { timeout: 10_000 });
    if (await amount.inputValue() !== "500.5") throw new Error("decimal amount was not restored");
    if (await frequency.inputValue() !== "6h") throw new Error("buy frequency was not restored");
    if (await duration.inputValue() !== "60") throw new Error("duration was not restored");
    if (await target.inputValue() !== "100") throw new Error("profit target was not restored");
    if ((await page.getByRole("button", { name: "FDV", exact: true }).first().getAttribute("aria-pressed")) !== "true") {
      throw new Error("FDV mode was not restored");
    }
    if (await page.locator("#pool-source").inputValue() !== `base:${POOL_B}`) {
      throw new Error("pool selection was not restored");
    }
  });

  await step("candle errors stay inside the token workspace", async () => {
    await frequency.selectOption("daily");
    const fourHourRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/candles"
        && url.searchParams.get("timeframe") === "hour"
        && url.searchParams.get("aggregate") === "4";
    });
    await generate.click();
    await fourHourRequest;
    await page.waitForFunction(() => (
      new URL(window.location.href).searchParams.get("frequency") === "daily"
      && document.querySelector(".cmvng-scheduled-chart__canvas canvas")
    ));
    failHourlyCandles = true;
    await frequency.selectOption("1h");
    await generate.click();
    await page.waitForFunction(() => document.body.innerText.includes("Smoke candles are unavailable."));
    if (!(await page.locator(".token-workspace").innerText()).includes("Smoke candles are unavailable.")) {
      throw new Error("missing localized candle error message");
    }
    failHourlyCandles = false;
  });

  await step("contract-resolution errors replace stale results", async () => {
    await page.fill("#contract-address", BAD_CONTRACT);
    await page.click('.contract-form button[type="submit"]');
    const alert = page.locator('.inline-alert[role="alert"]');
    await alert.waitFor();
    if (!(await alert.innerText()).includes("Smoke token was not found.")) {
      throw new Error("missing resolution error message");
    }
    if (await page.locator(".token-workspace").count()) {
      throw new Error("stale token results remained visible");
    }
  });

  await context.close();
} finally {
  await browser?.close();
  server.kill();
}

console.log(process.exitCode ? "onchain smoke FAILED" : "onchain smoke passed");
