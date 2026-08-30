import { normalizeCandles } from "./dcaEngine.js";

export const ILLUSTRATIVE_TOUCH_NOTICE =
  "Retrospective, in-sample intersections using today’s selected plan levels. These levels were not known at those historical candles; the markers are not fills, executed trades, or a backtest.";

const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function legNumber(leg, fallbackIndex) {
  const match = String(leg?.id || "").match(/^B(\d+)$/i);
  return match ? Number(match[1]) : fallbackIndex + 1;
}

function normalizeLegs(plan) {
  if (!Array.isArray(plan?.legs)) return [];

  return plan.legs
    .flatMap((leg, index) => {
      const midpoint = Number(leg?.midpoint ?? leg?.price);
      const rawLower = Number(leg?.lower ?? midpoint);
      const rawUpper = Number(leg?.upper ?? midpoint);

      if (![midpoint, rawLower, rawUpper].every(finitePositive)) return [];

      const number = legNumber(leg, index);
      return [{
        ...leg,
        id: `B${number}`,
        number,
        midpoint,
        lower: Math.min(rawLower, rawUpper),
        upper: Math.max(rawLower, rawUpper),
      }];
    })
    .sort((a, b) => a.number - b.number);
}

function touchBase({ id, kind, time, price, label, detail }) {
  return {
    id: `illustrative-${id}-${time}`,
    markerId: id,
    kind,
    time,
    price,
    label,
    detail,
    illustrative: true,
    executed: false,
    backtest: false,
  };
}

function buyTouch(leg, candle) {
  return {
    ...touchBase({
      id: leg.id,
      kind: "buy-zone-touch",
      time: candle.time,
      price: clamp(leg.midpoint, candle.low, candle.high),
      label: `${leg.id} zone touch`,
      detail: `This historical candle intersected the selected plan's current ${leg.id} zone. It does not prove an order fill.`,
    }),
    legId: leg.id,
    allocationPct: Number.isFinite(Number(leg.allocationPct))
      ? Number(leg.allocationPct)
      : null,
    amountUsd: Number.isFinite(Number(leg.amountUsd)) ? Number(leg.amountUsd) : null,
    zoneLower: leg.lower,
    zoneUpper: leg.upper,
  };
}

function outcomeTouch(kind, candle, plan) {
  const isTarget = kind === "target-touch";
  const id = isTarget ? "S1" : "X1";
  const price = Number(isTarget ? plan.targetPrice : plan.invalidationPrice);
  return {
    ...touchBase({
      id,
      kind,
      time: candle.time,
      price,
      label: isTarget ? "S1 target touch" : "X1 reassess touch",
      detail: isTarget
        ? "This later historical candle intersected the conditional target after every plan zone had been touched. It is not an executed sale."
        : "This later historical candle closed below the reassessment level after every plan zone had been touched. X1 is not an automatic stop or executed sale.",
    }),
  };
}

function touchesRange(candle, lower, upper) {
  return candle.low <= upper && candle.high >= lower;
}

function eventOrder(event) {
  const buyMatch = String(event.markerId).match(/^B(\d+)$/);
  if (buyMatch) return Number(buyMatch[1]);
  if (event.markerId === "S1") return 50;
  if (event.markerId === "X1") return 60;
  return 70;
}

/**
 * Projects a selected plan's current levels over historical OHLCV candles.
 *
 * The returned events are illustrative level touches only. They must never be
 * described as fills, trades, or a backtest. Events are chronological so they
 * can be passed directly to Lightweight Charts; same-candle buys are ordered
 * B1, B2, B3, B4 before any terminal event.
 */
export function buildIllustrativePlanTouches({ candles = [], plan = null, startTime = null } = {}) {
  const normalizedCandles = normalizeCandles(candles);
  const legs = normalizeLegs(plan);

  if (normalizedCandles.length < 2 || !legs.length || plan?.mode === "blocked") return [];

  const numericStartTime = Number(startTime);
  const hasStartTime = Number.isFinite(numericStartTime);
  let firstCandidateIndex = hasStartTime
    ? normalizedCandles.findIndex(candle => candle.time >= numericStartTime)
    : 1;

  if (firstCandidateIndex < 0) return [];
  firstCandidateIndex = Math.max(1, firstCandidateIndex);

  const legStates = legs.map(leg => ({ leg, armed: false, touched: false }));
  const events = [];
  let finalBuyIndex = null;

  for (let index = firstCandidateIndex; index < normalizedCandles.length; index += 1) {
    const candle = normalizedCandles[index];
    const previous = normalizedCandles[index - 1];

    if (finalBuyIndex !== null && index > finalBuyIndex) {
      const targetPrice = Number(plan?.targetPrice);
      const invalidationPrice = Number(plan?.invalidationPrice);
      const targetTouched = finitePositive(targetPrice)
        && touchesRange(candle, targetPrice, targetPrice);
      const invalidationConfirmed = finitePositive(invalidationPrice)
        && candle.close < invalidationPrice;

      if (targetTouched && invalidationConfirmed) {
        events.push(outcomeTouch("target-touch", candle, plan));
        events.push(outcomeTouch("reassess-touch", candle, plan));
        break;
      }
      if (targetTouched) {
        events.push(outcomeTouch("target-touch", candle, plan));
        break;
      }
      if (invalidationConfirmed) {
        events.push(outcomeTouch("reassess-touch", candle, plan));
        break;
      }
    }

    let touchedThisCandle = false;
    for (const state of legStates) {
      if (state.touched) continue;
      if (!state.armed && previous.close > state.leg.upper) state.armed = true;
      if (!state.armed || !touchesRange(candle, state.leg.lower, state.leg.upper)) continue;

      state.touched = true;
      touchedThisCandle = true;
      events.push(buyTouch(state.leg, candle));
    }

    if (touchedThisCandle && legStates.every(state => state.touched)) {
      finalBuyIndex = index;
    }
  }

  return events.sort((a, b) => (a.time - b.time) || (eventOrder(a) - eventOrder(b)));
}
