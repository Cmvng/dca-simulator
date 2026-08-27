import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entryCount, buildSchedule, executeDca, validateCapital,
  requiredPriceForRoi, breakEvenPrice, FREQS,
} from "./dca.js";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9), `${msg}: ${a} vs ${b}`);

test("contribution counts per frequency (v1 rule)", () => {
  assert.equal(entryCount(3, 7), 13);     // weekly, 90 days
  assert.equal(entryCount(3, 1), 90);     // daily, 90 days
  assert.equal(entryCount(3, 0.5), 180);  // 12h, 90 days
  assert.equal(entryCount(6, 0.5), 180);  // clamped to MAX 180
  assert.equal(entryCount(1, 14), 4);     // bi-weekly 1 month → clamped to MIN 4
  assert.equal(entryCount(6, 14), 13);
});

test("schedule spacing follows the documented convention", () => {
  const s = buildSchedule({ capital: 1000, freqId: "weekly", months: 1 });
  assert.deepEqual(s.dayOffsets.slice(0, 3), [0, 7, 14]);
  close(s.amtPer * s.entries, 1000, "even split conserves capital");
});

test("fees: percentage, fixed, combined — units reflect the fee, capital stays transparent", () => {
  const prices = [100, 100, 100, 100];
  const pctOnly = executeDca({ amtPer: 100, entryPrices: prices, feePct: 1 });
  close(pctOnly.totalFees, 4, "1% of 4×$100");
  close(pctOnly.units, (99 / 100) * 4, "units bought with net amount");
  const fixedOnly = executeDca({ amtPer: 100, entryPrices: prices, feeFixed: 2 });
  close(fixedOnly.totalFees, 8, "fixed fee per purchase");
  close(fixedOnly.units, (98 / 100) * 4, "units after fixed fee");
  const both = executeDca({ amtPer: 100, entryPrices: prices, feePct: 1, feeFixed: 2 });
  close(both.totalFees, 12, "combined fees");
  close(both.totalInvested, 400, "gross capital unchanged");
  assert.ok(both.totalFees >= 0);
});

test("slippage raises execution price and lowers units", () => {
  const base = executeDca({ amtPer: 100, entryPrices: [100], slippagePct: 0 });
  const slip = executeDca({ amtPer: 100, entryPrices: [100], slippagePct: 1 });
  close(slip.buys[0].execPrice, 101, "1% slippage on $100");
  assert.ok(slip.units < base.units);
});

test("edge cases: one purchase, tiny and huge amounts stay finite", () => {
  const one = executeDca({ amtPer: 50, entryPrices: [123.45] });
  close(one.avgEntry, 123.45, "single-buy avg entry equals the price");
  const tiny = executeDca({ amtPer: 0.01, entryPrices: [0.00001234, 0.00001111] });
  assert.ok(Number.isFinite(tiny.units) && tiny.units > 0);
  const huge = executeDca({ amtPer: 1e8, entryPrices: [65000, 70000] });
  assert.ok(Number.isFinite(huge.units));
});

test("capital validation rejects NaN, negatives, infinities, and out-of-range", () => {
  assert.equal(validateCapital(NaN).ok, false);
  assert.equal(validateCapital(Infinity).ok, false);
  assert.equal(validateCapital(-5).ok, false);
  assert.equal(validateCapital(0).ok, false);
  assert.equal(validateCapital(5).ok, false);          // below minimum
  assert.equal(validateCapital(2e9).ok, false);        // above maximum
  assert.equal(validateCapital(500).ok, true);
});

test("required price / break-even math", () => {
  // $1,000 invested, 10 units → break-even $100; +50% → $150.
  close(breakEvenPrice(1000, 10), 100, "break-even");
  close(requiredPriceForRoi(1000, 10, 50), 150, "+50% price");
  assert.ok(Number.isNaN(requiredPriceForRoi(1000, 0, 50)), "no units → NaN, not Infinity");
});

test("all frequencies allow up to 6 months", () => {
  for (const f of FREQS) assert.equal(f.maxMonths, 6);
});
