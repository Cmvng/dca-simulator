// og-image.mjs — renders public/og.png, the 1200×630 Open Graph card that
// index.html points social scrapers at. Static build-time asset, not part of
// the app bundle. Regenerate after any brand or copy change:
//   node tools/og-image.mjs
// (CHROME_PATH overrides the Chromium binary; defaults to the sandbox's
// playwright build.)
//
// Colors mirror the CLEAR BLUE tokens in src/styles/theme.js and the LogoMark
// bars in src/components/ui.jsx — keep them in sync by hand. System-ui fonts
// only: this sandbox blocks outbound font hosts, and a scraper card must not
// depend on a webfont anyway.

import { chromium } from "playwright-core";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "og.png");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body {
    width: 1200px; height: 630px; background: #EEF3FA;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  body { display: flex; align-items: center; justify-content: center; }
  .card {
    width: 1096px; padding: 60px 72px 52px;
    background: #FFFFFF; border: 1px solid #FFFFFF; border-radius: 26px;
    box-shadow: 0 30px 80px -30px rgba(30,60,120,0.35);
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand svg { display: block; }
  .wordmark { font-size: 34px; font-weight: 800; letter-spacing: 0.01em; color: #0E1B33; }
  h1 {
    margin-top: 40px; font-size: 60px; font-weight: 700;
    letter-spacing: -0.02em; line-height: 1.16; color: #0E1B33;
  }
  h1 span { color: #2E6BF0; }
  .pills { display: flex; gap: 14px; margin-top: 40px; }
  .pill {
    display: inline-flex; align-items: center; border-radius: 100px;
    background: #DBE7FE; color: #2E6BF0;
    font-size: 23px; font-weight: 700; padding: 13px 28px;
  }
  .footer { margin-top: 42px; font-size: 22px; font-weight: 500; color: #5A6B87; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <svg width="58" height="58" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="8" width="4.6" height="13" rx="2.3" fill="#2559D0"/>
        <rect x="9.7" y="3" width="4.6" height="18" rx="2.3" fill="#2E6BF0"/>
        <rect x="16.4" y="11" width="4.6" height="10" rx="2.3" fill="#2E6BF0" opacity="0.55"/>
      </svg>
      <span class="wordmark">CMVNG</span>
    </div>
    <h1>Build a crypto DCA plan.<br><span>Stress-test it against real data.</span></h1>
    <div class="pills">
      <span class="pill">Scenarios</span>
      <span class="pill">Backtests</span>
      <span class="pill">DCA vs lump sum</span>
    </div>
    <div class="footer">A decision tool — not a prediction. Not financial advice.</div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"], // container lacks the privileges Chromium's sandbox needs
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await mkdir(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: "png" });
} finally {
  await browser.close();
}
const { size } = await stat(out);
console.log(`wrote ${out} (${size} bytes)`);
