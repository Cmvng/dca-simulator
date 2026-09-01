import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineStyle,
  TrackingModeExitMode,
} from "lightweight-charts";
import { SANS, T } from "../styles/theme.js";

const COLORS = {
  background: "#070A12",
  surface: "#101522",
  border: "#222A3B",
  grid: "rgba(139, 147, 167, 0.10)",
  text: "#F6F8FC",
  muted: "#8B93A7",
  positive: T.gain,
  negative: T.loss,
  dca: T.blue,
  average: "#D6DEEC",
  target: "#D86B16",
  invalidation: "#C92A1A",
};

const PRICE_KEYS = [
  "price",
  "midpoint",
  "entryPrice",
  "triggerPrice",
  "level",
  "midPrice",
];
const LEG_KEYS = ["legs", "entries", "dcaLegs", "levels", "buyZones", "zones"];
const MAX_PRICE_DECIMALS = 18;
const MAX_ACCESSIBLE_CANDLES = 50;
const VALUE_MODES = new Set(["price", "marketCap", "fdv"]);

const VALUE_MODE_LABELS = {
  price: "Price",
  marketCap: "Market cap",
  fdv: "FDV",
};

const VALUE_MODE_SHORT_LABELS = {
  price: "USD",
  marketCap: "MCAP",
  fdv: "FDV",
};

function asFiniteNumber(value) {
  if (value && typeof value === "object") {
    return asFiniteNumber(
      value.price ?? value.value ?? value.mid ?? value.midPrice ?? value.triggerPrice
    );
  }

  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = asFiniteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function normalizeTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    // GeckoTerminal and Lightweight Charts use seconds, while some adapters expose ms.
    return Math.floor(value > 100_000_000_000 ? value / 1000 : value);
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeTime(numeric);

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Math.floor(value.getTime() / 1000);
  }

  return null;
}

function normalizeCandle(raw) {
  const isTuple = Array.isArray(raw);
  const time = normalizeTime(isTuple ? raw[0] : raw?.time ?? raw?.timestamp ?? raw?.date);
  const open = asFiniteNumber(isTuple ? raw[1] : raw?.open ?? raw?.o);
  const high = asFiniteNumber(isTuple ? raw[2] : raw?.high ?? raw?.h);
  const low = asFiniteNumber(isTuple ? raw[3] : raw?.low ?? raw?.l);
  const close = asFiniteNumber(isTuple ? raw[4] : raw?.close ?? raw?.c);
  const volume = asFiniteNumber(
    isTuple ? raw[5] : raw?.volume ?? raw?.v ?? raw?.baseVolume ?? 0
  );

  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    high < low ||
    high < Math.max(open, close) ||
    low > Math.min(open, close)
  ) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume: volume !== null && volume > 0 ? volume : 0,
  };
}

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];

  // Last item wins when an API includes a still-forming candle twice.
  const byTime = new Map();
  for (const raw of candles) {
    const candle = normalizeCandle(raw);
    if (candle) byTime.set(candle.time, candle);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function legPrice(leg) {
  for (const key of PRICE_KEYS) {
    const value = asFiniteNumber(leg?.[key]);
    if (value !== null && value > 0) return value;
  }

  const range = Array.isArray(leg?.range) ? leg.range : null;
  const low = firstFinite(
    leg?.zoneLow,
    leg?.lowPrice,
    leg?.lowerPrice,
    leg?.lower,
    leg?.minPrice,
    leg?.zone?.low,
    range?.[0]
  );
  const high = firstFinite(
    leg?.zoneHigh,
    leg?.highPrice,
    leg?.upperPrice,
    leg?.upper,
    leg?.maxPrice,
    leg?.zone?.high,
    range?.[1]
  );

  if (low !== null && high !== null && low > 0 && high > 0) {
    return (low + high) / 2;
  }
  return low > 0 ? low : high > 0 ? high : null;
}

function legBounds(leg, midpoint) {
  const range = Array.isArray(leg?.range) ? leg.range : null;
  const first = firstFinite(
    leg?.zoneLow,
    leg?.lowPrice,
    leg?.lowerPrice,
    leg?.lower,
    leg?.minPrice,
    leg?.zone?.low,
    range?.[0]
  );
  const second = firstFinite(
    leg?.zoneHigh,
    leg?.highPrice,
    leg?.upperPrice,
    leg?.upper,
    leg?.maxPrice,
    leg?.zone?.high,
    range?.[1]
  );
  const valid = [first, second].filter(value => value > 0);
  if (!valid.length) return { lower: midpoint, upper: midpoint };
  if (valid.length === 1) return { lower: valid[0], upper: valid[0] };
  return { lower: Math.min(...valid), upper: Math.max(...valid) };
}

function markerIdForLeg(leg, index) {
  return /^B\d+$/i.test(leg?.id) ? leg.id.toUpperCase() : `B${index + 1}`;
}

function normalizePlan(plan) {
  const source = plan && typeof plan === "object" ? plan : {};
  let rawLegs = Array.isArray(plan) ? plan : null;

  if (!rawLegs) {
    for (const key of LEG_KEYS) {
      if (Array.isArray(source[key])) {
        rawLegs = source[key];
        break;
      }
    }
  }

  const legs = (rawLegs || []).flatMap((leg, index) => {
    const price = legPrice(leg);
    if (!(price > 0)) return [];
    const { lower, upper } = legBounds(leg, price);

    const explicitPercent = firstFinite(
      leg?.allocationPct,
      leg?.allocationPercent,
      leg?.percentage,
      leg?.percent
    );
    const fraction = firstFinite(leg?.weight, leg?.allocationFraction);
    const allocationPct =
      explicitPercent !== null
        ? explicitPercent
        : fraction !== null
          ? fraction <= 1
            ? fraction * 100
            : fraction
          : null;

    return [
      {
        id: String(leg?.id ?? `leg-${index + 1}`),
        label: String(leg?.label ?? leg?.name ?? `DCA ${index + 1}`),
        price,
        lower,
        upper,
        allocationPct,
        amount: firstFinite(
          leg?.amount,
          leg?.amountUsd,
          leg?.cashAmount,
          leg?.allocationAmount,
          leg?.capital
        ),
      },
    ];
  });

  const suppliedAverage = firstFinite(
    source.weightedAverage,
    source.weightedAverageEntry,
    source.weightedAveragePrice,
    source.weightedAvgEntry,
    source.averageEntry,
    source.avgEntry,
    source.summary?.weightedAverage,
    source.summary?.averageEntry
  );

  // Equal or percentage-based dollar allocations produce a harmonic price average.
  const weightedAverage =
    suppliedAverage > 0
      ? suppliedAverage
      : legs.length
        ? (() => {
            const weights = legs.map((leg) =>
              leg.amount > 0 ? leg.amount : leg.allocationPct > 0 ? leg.allocationPct : 1
            );
            const totalCash = weights.reduce((sum, weight) => sum + weight, 0);
            const totalTokens = legs.reduce(
              (sum, leg, index) => sum + weights[index] / leg.price,
              0
            );
            return totalTokens > 0 ? totalCash / totalTokens : null;
          })()
        : null;

  const firstTarget = Array.isArray(source.targets) ? source.targets[0] : null;

  return {
    legs,
    mode: source.mode || "adaptive",
    targetPct: firstFinite(source.targetPct, source.gainTargetPct),
    currentPrice: firstFinite(
      source.currentPrice,
      source.livePrice,
      source.refPrice,
      source.quality?.currentPrice,
      source.market?.price
    ),
    weightedAverage,
    target: firstFinite(
      source.targetPrice,
      source.target,
      source.takeProfitPrice,
      source.takeProfit,
      firstTarget,
      source.summary?.targetPrice
    ),
    invalidation: firstFinite(
      source.invalidationPrice,
      source.invalidation,
      source.stopPrice,
      source.stopLoss,
      source.risk?.invalidationPrice
    ),
  };
}

function precisionFor(candles, levels) {
  const positives = [
    ...candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]),
    ...levels,
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (!positives.length) return 8;
  const smallest = Math.min(...positives);
  if (smallest >= 100) return 2;
  if (smallest >= 1) return 4;

  return Math.min(
    MAX_PRICE_DECIMALS,
    Math.max(4, Math.ceil(-Math.log10(smallest)) + 4)
  );
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  if (absolute === 0) return "$0";

  if (absolute >= 1_000_000) {
    return `${sign}$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(absolute)}`;
  }

  if (absolute >= 1) {
    return `${sign}$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: absolute >= 1000 ? 2 : 4,
    }).format(absolute)}`;
  }

  if (absolute < 1e-8) return `${sign}$${absolute.toExponential(4)}`;

  const decimals = Math.min(12, Math.max(4, Math.ceil(-Math.log10(absolute)) + 4));
  return `${sign}$${absolute.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: decimals,
  })}`;
}

function formatValuation(value) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute < 10_000) return formatPrice(value);
  return `${value < 0 ? "−" : ""}$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(absolute)}`;
}

function valuationScaleFor({
  requestedMode,
  currentPrice,
  valuationScales,
  currentMarketCap,
  currentFdv,
}) {
  if (requestedMode === "price") return 1;
  if (!(currentPrice > 0)) return null;

  const directValue = requestedMode === "marketCap"
    ? asFiniteNumber(currentMarketCap)
    : asFiniteNumber(currentFdv);
  if (directValue > 0) return directValue / currentPrice;

  const suppliedScale = valuationScales?.[requestedMode];
  const multiplier = asFiniteNumber(
    suppliedScale?.multiplier ?? suppliedScale?.scale ?? suppliedScale
  );
  if (suppliedScale?.available === false || !(multiplier > 0)) return null;
  return multiplier;
}

function scaleCandle(candle, multiplier) {
  return {
    ...candle,
    open: candle.open * multiplier,
    high: candle.high * multiplier,
    low: candle.low * multiplier,
    close: candle.close * multiplier,
  };
}

function scalePlan(plan, multiplier) {
  const scale = value => value > 0 ? value * multiplier : value;
  return {
    ...plan,
    currentPrice: scale(plan.currentPrice),
    weightedAverage: scale(plan.weightedAverage),
    target: scale(plan.target),
    invalidation: scale(plan.invalidation),
    legs: plan.legs.map(leg => ({
      ...leg,
      price: scale(leg.price),
      lower: scale(leg.lower),
      upper: scale(leg.upper),
    })),
  };
}

function illustrativeEventOrder(event) {
  const buy = String(event.markerId || "").match(/^B(\d+)$/i);
  if (buy) return Number(buy[1]);
  if (event.markerId === "S1") return 50;
  if (event.markerId === "X1") return 60;
  return 70;
}

function illustrativeMarker(event) {
  const markerId = String(event.markerId || "?").toUpperCase();
  const isBuy = /^B\d+$/.test(markerId);
  const isTarget = markerId === "S1";
  const isRisk = markerId === "X1";

  return {
    id: event.id,
    time: event.time,
    price: event.price,
    position: isBuy ? "atPriceBottom" : "atPriceTop",
    shape: isBuy ? "arrowUp" : isTarget ? "arrowDown" : "square",
    color: isBuy
      ? COLORS.positive
      : isTarget
        ? COLORS.target
        : isRisk
          ? COLORS.invalidation
          : "#D89A17",
    text: isBuy
      ? `+${markerId}`
      : isTarget
        ? `−${markerId} REF`
        : isRisk
          ? `!${markerId} CLOSE`
          : `?${markerId}`,
  };
}

function formatVolume(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(time, withTime = true) {
  const date = new Date(Number(time) * 1000);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
      : {}),
  }).format(date);
}

function messageFromError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string") return error.message;
  return "The chart could not be loaded.";
}

const COMPONENT_CSS = `
  .cmvng-dca-chart {
    color: ${COLORS.text};
    background: ${COLORS.background};
    border: 1px solid ${COLORS.border};
    border-radius: 22px;
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28);
    font-family: ${SANS};
    overflow: hidden;
    position: relative;
  }
  .cmvng-dca-chart * { box-sizing: border-box; }
  .cmvng-dca-chart__head {
    align-items: center;
    display: flex;
    gap: 14px;
    justify-content: space-between;
    min-height: 72px;
    padding: 14px 16px 10px;
  }
  .cmvng-dca-chart__identity { min-width: 0; }
  .cmvng-dca-chart__eyebrow {
    color: ${COLORS.muted};
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .12em;
    margin-bottom: 3px;
    text-transform: uppercase;
  }
  .cmvng-dca-chart__symbol {
    font-size: clamp(16px, 3.6vw, 20px);
    font-weight: 700;
    letter-spacing: -.02em;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmvng-dca-chart__quote { text-align: right; }
  .cmvng-dca-chart__price {
    display: block;
    font-size: clamp(18px, 4vw, 24px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -.035em;
    white-space: nowrap;
  }
  .cmvng-dca-chart__source {
    align-items: center;
    color: ${COLORS.muted};
    display: inline-flex;
    font-size: 11px;
    gap: 6px;
    margin-top: 2px;
  }
  .cmvng-dca-chart__source-dot {
    background: ${COLORS.dca};
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(46, 107, 240, .16);
    height: 6px;
    width: 6px;
  }
  .cmvng-dca-chart__stage {
    background: ${COLORS.background};
    height: clamp(330px, 48vh, 560px);
    min-height: 330px;
    position: relative;
  }
  .cmvng-dca-chart__canvas { height: 100%; width: 100%; }
  .cmvng-dca-chart__execution-overlay {
    inset: 0 77px 0 0;
    overflow: hidden;
    pointer-events: none;
    position: absolute;
    z-index: 2;
  }
  .cmvng-dca-chart__execution-overlay::before {
    border-left: 1px dashed rgba(174, 182, 199, .30);
    bottom: 16px;
    content: "";
    left: 20px;
    position: absolute;
    top: 16px;
  }
  .cmvng-dca-chart__buy-band {
    background: linear-gradient(90deg, rgba(46, 107, 240, .06), rgba(46, 107, 240, .17));
    border-bottom: 1px solid rgba(100, 149, 255, .42);
    border-top: 1px solid rgba(100, 149, 255, .42);
    left: 0;
    min-height: 3px;
    position: absolute;
    right: 0;
  }
  .cmvng-dca-chart__buy-badge,
  .cmvng-dca-chart__level-badge {
    align-items: center;
    background: rgba(7, 10, 18, .92);
    border-radius: 5px;
    display: inline-flex;
    gap: 5px;
    font: 800 11px/1 ${SANS};
    letter-spacing: .035em;
    left: 8px;
    padding: 3px 6px 3px 2px;
    position: absolute;
    white-space: nowrap;
  }
  .cmvng-dca-chart__buy-badge {
    border: 1px solid rgba(18, 183, 106, .52);
    box-shadow: 0 3px 10px rgba(18, 183, 106, .18);
    color: #94EBC0;
    top: 50%;
    transform: translateY(-50%);
  }
  .cmvng-dca-chart__action-glyph {
    align-items: center;
    background: ${COLORS.background};
    border: 2px solid currentColor;
    border-radius: 50%;
    display: inline-flex;
    font-size: 12px;
    height: 20px;
    justify-content: center;
    line-height: 1;
    width: 20px;
  }
  .cmvng-dca-chart__level-marker {
    border-top: 1px dashed var(--marker-color);
    left: 0;
    position: absolute;
    right: 0;
    top: 0;
  }
  .cmvng-dca-chart__level-badge {
    border: 1px solid var(--marker-color);
    color: var(--marker-color);
    top: 0;
    transform: translateY(-50%);
  }
  .cmvng-dca-chart__level-marker--target { --marker-color: ${COLORS.target}; }
  .cmvng-dca-chart__level-marker--risk { --marker-color: ${COLORS.invalidation}; }
  .cmvng-dca-chart__tooltip {
    background: rgba(16, 21, 34, .88);
    border-bottom: 1px solid rgba(139, 147, 167, .16);
    border-top: 1px solid rgba(139, 147, 167, .16);
    color: #C9CFDB;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    line-height: 1.45;
    min-height: 34px;
    overflow: hidden;
    padding: 8px 12px;
    pointer-events: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmvng-dca-chart__reset {
    align-items: center;
    background: rgba(16, 21, 34, .90);
    border: 1px solid rgba(139, 147, 167, .24);
    border-radius: 10px;
    color: #DCE1EB;
    cursor: pointer;
    display: inline-flex;
    font: 700 11px/1 ${SANS};
    gap: 6px;
    min-height: 44px;
    padding: 0 11px;
    position: absolute;
    right: 10px;
    top: 8px;
    transition: background-color .16s ease, border-color .16s ease, transform .16s ease;
    z-index: 5;
  }
  .cmvng-dca-chart__reset:hover {
    background: #171D2C;
    border-color: rgba(46, 107, 240, .65);
  }
  .cmvng-dca-chart__reset:active { transform: scale(.97); }
  .cmvng-dca-chart__reset:focus-visible {
    outline: 3px solid rgba(46, 107, 240, .55);
    outline-offset: 2px;
  }
  .cmvng-dca-chart__state {
    align-items: center;
    background: rgba(7, 10, 18, .88);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 32px;
    position: absolute;
    text-align: center;
    z-index: 6;
  }
  .cmvng-dca-chart__state-card { max-width: 360px; }
  .cmvng-dca-chart__state-title {
    color: ${COLORS.text};
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 6px;
  }
  .cmvng-dca-chart__state-copy {
    color: ${COLORS.muted};
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
  }
  .cmvng-dca-chart__loader {
    border: 2px solid rgba(46, 107, 240, .32);
    border-radius: 50%;
    border-top-color: ${COLORS.average};
    height: 28px;
    margin: 0 auto 12px;
    width: 28px;
  }
  .cmvng-dca-chart__legend {
    align-items: center;
    border-top: 1px solid rgba(34, 42, 59, .75);
    display: flex;
    gap: 8px;
    min-height: 47px;
    overflow-x: auto;
    padding: 8px 12px;
    scrollbar-width: none;
  }
  .cmvng-dca-chart__legend::-webkit-scrollbar { display: none; }
  .cmvng-dca-chart__key {
    align-items: center;
    background: rgba(16, 21, 34, .78);
    border: 1px solid rgba(139, 147, 167, .13);
    border-radius: 999px;
    color: #AEB6C7;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    gap: 6px;
    letter-spacing: .02em;
    padding: 6px 8px;
  }
  .cmvng-dca-chart__key-line {
    border-top: 2px solid var(--key-color);
    display: inline-block;
    width: 13px;
  }
  .cmvng-dca-chart__key-line--dashed { border-top-style: dashed; }
  .cmvng-dca-chart__key-line--dotted { border-top-style: dotted; }
  .cmvng-dca-chart__key--illustrative .cmvng-dca-chart__action-glyph {
    color: #D89A17;
    font-size: 11px;
    height: 17px;
    width: 17px;
  }
  .cmvng-dca-chart__touch-notice {
    align-items: flex-start;
    background: rgba(216, 154, 23, .08);
    border-top: 1px solid rgba(216, 154, 23, .20);
    color: #D5BE89;
    display: flex;
    font-size: 11px;
    gap: 7px;
    line-height: 1.45;
    padding: 8px 12px;
  }
  .cmvng-dca-chart__touch-notice strong {
    color: #F0D89D;
    flex: 0 0 auto;
  }
  .cmvng-dca-chart__value-notice {
    background: rgba(46, 107, 240, .07);
    border-top: 1px solid rgba(46, 107, 240, .18);
    color: #AEB9D2;
    font-size: 11px;
    line-height: 1.45;
    padding: 7px 12px;
  }
  .cmvng-dca-chart__value-notice strong { color: #D6DEEC; }
  .cmvng-dca-chart__attribution {
    align-items: center;
    border-top: 1px solid rgba(34, 42, 59, .48);
    color: #8B93A7;
    display: flex;
    font-size: 11px;
    justify-content: space-between;
    line-height: 1.4;
    padding: 6px 12px 7px;
  }
  .cmvng-dca-chart__attribution a { color: #AEB6C7; text-decoration: none; }
  .cmvng-dca-chart__attribution a:hover { color: #B5BDCB; text-decoration: underline; }
  .cmvng-dca-chart__sr-only {
    border: 0 !important;
    clip: rect(0 0 0 0) !important;
    clip-path: inset(50%) !important;
    height: 1px !important;
    margin: -1px !important;
    overflow: hidden !important;
    padding: 0 !important;
    position: absolute !important;
    white-space: nowrap !important;
    width: 1px !important;
  }
  @media (max-width: 540px) {
    .cmvng-dca-chart { border-radius: 18px; }
    .cmvng-dca-chart__head { min-height: 67px; padding-inline: 13px; }
    .cmvng-dca-chart__stage { height: clamp(330px, 46vh, 470px); }
    .cmvng-dca-chart__tooltip { white-space: normal; }
    .cmvng-dca-chart__reset { min-height: 44px; padding: 0 9px; right: 8px; }
    .cmvng-dca-chart__reset span { display: none; }
    .cmvng-dca-chart__touch-notice { display: block; }
    .cmvng-dca-chart__touch-notice strong { display: block; margin-bottom: 2px; }
    .cmvng-dca-chart__attribution { align-items: flex-start; flex-direction: column; gap: 2px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cmvng-dca-chart__reset { transition: none; }
  }
`;

/**
 * Dark, responsive OHLCV chart for the contract-address DCA experience.
 *
 * Expected normalized inputs:
 * - candles: [{ time|timestamp, open, high, low, close, volume }]
 * - plan: { legs: [{ price, allocationPct }], weightedAverage, target, invalidation }
 * - valueMode: price | marketCap | fdv, with an engine valuationScales object (either
 *   passed directly or attached to plan) or the matching current valuation prop.
 * - illustrativeEvents: historical intersections from buildIllustrativePlanTouches;
 *   these are always rendered as illustrative, non-executed markers.
 *
 * Common aliases and GeckoTerminal OHLCV tuples are accepted defensively, but provider
 * response normalization should still live in the API/client layer.
 */
export default function DcaChart({
  candles = [],
  plan = null,
  tokenSymbol,
  symbol,
  valueMode = "price",
  valuationScales = null,
  currentMarketCap = null,
  currentFdv = null,
  showIllustrativeTouches = false,
  illustrativeEvents = [],
  loading = false,
  error = null,
}) {
  const reactId = useId();
  const summaryId = `cmvng-chart-summary-${reactId.replace(/:/g, "")}`;
  const chartContainerRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const illustrativeMarkersRef = useRef(null);
  const autoscaleRangeRef = useRef(null);
  const priceLinesRef = useRef(new Map());
  const executionOverlayRef = useRef(null);
  const normalizedPlanRef = useRef(null);
  const annotationFrameRef = useRef(null);
  const formatterRef = useRef(formatPrice);
  const latestCandleRef = useRef(null);
  const crosshairActiveRef = useRef(false);
  const previousDatasetRef = useRef(null);

  const displaySymbol = String(tokenSymbol || symbol || "TOKEN").toUpperCase();
  const priceCandles = useMemo(() => normalizeCandles(candles), [candles]);
  const normalizedPricePlan = useMemo(() => normalizePlan(plan), [plan]);
  const latestPriceCandle = priceCandles.at(-1) || null;
  const referencePrice = normalizedPricePlan.currentPrice > 0
    ? normalizedPricePlan.currentPrice
    : latestPriceCandle?.close ?? null;
  const requestedValueMode = VALUE_MODES.has(valueMode) ? valueMode : "price";
  const resolvedValuationScales = valuationScales || plan?.valuationScales || null;
  const requestedMultiplier = useMemo(
    () => valuationScaleFor({
      requestedMode: requestedValueMode,
      currentPrice: referencePrice,
      valuationScales: resolvedValuationScales,
      currentMarketCap,
      currentFdv,
    }),
    [
      currentFdv,
      currentMarketCap,
      referencePrice,
      requestedValueMode,
      resolvedValuationScales,
    ]
  );
  const activeValueMode = requestedMultiplier > 0 ? requestedValueMode : "price";
  const valueMultiplier = activeValueMode === requestedValueMode ? requestedMultiplier : 1;
  const valueModeFallback = requestedValueMode !== activeValueMode;
  const valueModeLabel = VALUE_MODE_LABELS[activeValueMode];
  const valueModeShortLabel = VALUE_MODE_SHORT_LABELS[activeValueMode];
  const normalizedCandles = useMemo(
    () => priceCandles.map(candle => scaleCandle(candle, valueMultiplier)),
    [priceCandles, valueMultiplier]
  );
  const normalizedPlan = useMemo(
    () => scalePlan(normalizedPricePlan, valueMultiplier),
    [normalizedPricePlan, valueMultiplier]
  );
  const accessibleCandles = useMemo(
    () => normalizedCandles.slice(-MAX_ACCESSIBLE_CANDLES),
    [normalizedCandles],
  );
  const latestCandle = normalizedCandles.at(-1) || null;
  const currentPrice =
    normalizedPlan.currentPrice > 0 ? normalizedPlan.currentPrice : latestCandle?.close ?? null;

  const displayIllustrativeEvents = useMemo(() => {
    if (!showIllustrativeTouches || !Array.isArray(illustrativeEvents)) return [];
    const candlesByTime = new Map(priceCandles.map(candle => [candle.time, candle]));

    return illustrativeEvents
      .flatMap((event, index) => {
        const time = normalizeTime(event?.time ?? event?.timestamp ?? event?.date);
        const candle = candlesByTime.get(time);
        if (!candle) return [];
        const eventPrice = firstFinite(event?.price, event?.value, candle.close);
        if (!(eventPrice > 0)) return [];
        const markerId = String(event?.markerId ?? event?.levelId ?? event?.id ?? `event-${index + 1}`)
          .replace(/^illustrative-/i, "")
          .toUpperCase();

        return [{
          ...event,
          id: String(event?.id ?? `illustrative-${markerId}-${time}-${index}`),
          markerId,
          time,
          price: eventPrice * valueMultiplier,
          label: String(event?.label ?? `${markerId} level touch`),
          detail: String(
            event?.detail
            ?? "This historical candle intersected a current plan level. It is not an executed trade."
          ),
          illustrative: true,
          executed: false,
          backtest: false,
        }];
      })
      .sort((left, right) =>
        (left.time - right.time) || (illustrativeEventOrder(left) - illustrativeEventOrder(right))
      );
  }, [illustrativeEvents, priceCandles, showIllustrativeTouches, valueMultiplier]);

  const nativeIllustrativeMarkers = useMemo(
    () => displayIllustrativeEvents.map(illustrativeMarker),
    [displayIllustrativeEvents]
  );

  const numericLevels = useMemo(
    () =>
      [
        currentPrice,
        ...normalizedPlan.legs.map((leg) => leg.price),
        normalizedPlan.weightedAverage,
        normalizedPlan.target,
        normalizedPlan.invalidation,
      ].filter((value) => value > 0),
    [currentPrice, normalizedPlan]
  );

  const decimals = useMemo(
    () => precisionFor(normalizedCandles, numericLevels),
    [normalizedCandles, numericLevels]
  );

  const chartPriceFormatter = useCallback(
    (value) => {
      if (!Number.isFinite(value)) return "—";
      if (activeValueMode !== "price") return formatValuation(value);
      const absolute = Math.abs(value);
      if (absolute !== 0 && absolute < 1e-8) return `$${value.toExponential(3)}`;
      if (absolute >= 1) return formatPrice(value);
      return `$${value.toLocaleString("en-US", {
        useGrouping: false,
        maximumFractionDigits: decimals,
      })}`;
    },
    [activeValueMode, decimals]
  );

  const desiredLines = useMemo(() => {
    const lines = [];

    if (currentPrice > 0) {
      lines.push({
        key: "current",
        type: `Current ${valueModeLabel.toLowerCase()}`,
        price: currentPrice,
        allocation: null,
        options: {
          id: "cmvng-current-price",
          price: currentPrice,
          color: COLORS.average,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: activeValueMode === "price" ? "CURRENT" : `CURRENT ${valueModeShortLabel}`,
        },
      });
    }

    normalizedPlan.legs.forEach((leg, index) => {
      const allocationLabel =
        leg.allocationPct !== null ? ` ${leg.allocationPct.toFixed(0)}%` : "";
      const markerId = markerIdForLeg(leg, index);
      lines.push({
        key: `dca-${leg.id}-${index}`,
        type: `${markerId} potential buy zone (${valueModeLabel})`,
        price: leg.price,
        allocation: leg.allocationPct,
        markerId,
        options: {
          id: `cmvng-dca-${index + 1}`,
          price: leg.price,
          color: COLORS.dca,
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: `${markerId} ·${allocationLabel}`,
        },
      });
    });

    if (normalizedPlan.weightedAverage > 0) {
      lines.push({
        key: "weighted-average",
        type: activeValueMode === "price"
          ? "Average entry after all planned buys fill"
          : `Implied ${valueModeLabel.toLowerCase()} at the average entry`,
        price: normalizedPlan.weightedAverage,
        allocation: null,
        options: {
          id: "cmvng-weighted-average",
          price: normalizedPlan.weightedAverage,
          color: COLORS.average,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: activeValueMode === "price" ? "AVG ENTRY" : `AVG ${valueModeShortLabel}`,
        },
      });
    }

    if (normalizedPlan.target > 0) {
      lines.push({
        key: "target",
        type: `S1 conditional target reference after all planned fills; no sell allocation is modeled (${valueModeLabel})`,
        price: normalizedPlan.target,
        allocation: null,
        markerId: "S1",
        options: {
          id: "cmvng-target",
          price: normalizedPlan.target,
          color: COLORS.target,
          lineWidth: 2,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: false,
          title: `S1 TARGET REF · +${normalizedPlan.targetPct?.toFixed(0) || "?"}%`,
        },
      });
    }

    if (normalizedPlan.invalidation > 0) {
      lines.push({
        key: "invalidation",
        type: `X1 manual reassessment only after a selected-timeframe candle CLOSES below X1; a wick does not count, and no automatic stop or sale is modeled (${valueModeLabel})`,
        price: normalizedPlan.invalidation,
        allocation: null,
        markerId: "X1",
        options: {
          id: "cmvng-invalidation",
          price: normalizedPlan.invalidation,
          color: COLORS.invalidation,
          lineWidth: 2,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: false,
          title: "X1 · CLOSE BELOW → REASSESS",
        },
      });
    }

    return lines;
  }, [activeValueMode, currentPrice, normalizedPlan, valueModeLabel, valueModeShortLabel]);

  const updateTooltip = useCallback((candle) => {
    if (!tooltipRef.current || !candle) return;
    tooltipRef.current.textContent = `${formatTime(candle.time)} UTC  O ${formatterRef.current(
      candle.open
    )}  H ${formatterRef.current(candle.high)}  L ${formatterRef.current(
      candle.low
    )}  C ${formatterRef.current(candle.close)}  V ${formatVolume(candle.volume)}`;
  }, []);

  const recalculateAnnotations = useCallback(() => {
    const series = candleSeriesRef.current;
    const overlay = executionOverlayRef.current;
    const currentPlan = normalizedPlanRef.current;
    if (!series || !overlay || !currentPlan) return;
    const priceScaleWidth = chartRef.current?.priceScale("right").width() || 76;
    overlay.style.right = `${priceScaleWidth + 1}px`;
    const railItems = [];

    currentPlan.legs.forEach((leg, index) => {
      const markerId = markerIdForLeg(leg, index);
      const node = overlay.querySelector(`[data-marker-id="${markerId}"]`);
      if (!node) return;
      const upperY = series.priceToCoordinate(leg.upper);
      const lowerY = series.priceToCoordinate(leg.lower);
      if (!Number.isFinite(upperY) || !Number.isFinite(lowerY)) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.style.top = `${Math.min(upperY, lowerY)}px`;
      node.style.height = `${Math.max(3, Math.abs(lowerY - upperY))}px`;
      const badge = node.querySelector(".cmvng-dca-chart__buy-badge");
      if (badge) railItems.push({ badge, anchorY: (upperY + lowerY) / 2 });
    });

    [
      ["S1", currentPlan.target],
      ["X1", currentPlan.invalidation],
    ].forEach(([markerId, price]) => {
      const node = overlay.querySelector(`[data-marker-id="${markerId}"]`);
      if (!node) return;
      const y = series.priceToCoordinate(price);
      if (!Number.isFinite(y)) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.style.transform = `translateY(${y}px)`;
      const badge = node.querySelector(".cmvng-dca-chart__level-badge");
      if (badge) railItems.push({ badge, anchorY: y });
    });

    const minimumGap = 30;
    const railPadding = 22;
    const maximumY = Math.max(railPadding, overlay.clientHeight - railPadding);
    const positioned = railItems
      .filter(item => Number.isFinite(item.anchorY))
      .sort((left, right) => left.anchorY - right.anchorY)
      .map(item => ({ ...item, displayY: Math.min(maximumY, Math.max(railPadding, item.anchorY)) }));

    for (let index = 1; index < positioned.length; index += 1) {
      positioned[index].displayY = Math.max(
        positioned[index].displayY,
        positioned[index - 1].displayY + minimumGap,
      );
    }
    if (positioned.at(-1)?.displayY > maximumY) {
      positioned[positioned.length - 1].displayY = maximumY;
      for (let index = positioned.length - 2; index >= 0; index -= 1) {
        positioned[index].displayY = Math.min(
          positioned[index].displayY,
          positioned[index + 1].displayY - minimumGap,
        );
      }
    }
    if (positioned[0]?.displayY < railPadding) {
      const shift = railPadding - positioned[0].displayY;
      positioned.forEach(item => { item.displayY += shift; });
    }
    positioned.forEach(item => {
      const offset = item.displayY - item.anchorY;
      item.badge.style.transform = `translateY(calc(-50% + ${offset.toFixed(1)}px))`;
    });
  }, []);

  const scheduleAnnotationLayout = useCallback(() => {
    if (annotationFrameRef.current) cancelAnimationFrame(annotationFrameRef.current);
    annotationFrameRef.current = requestAnimationFrame(() => {
      annotationFrameRef.current = null;
      recalculateAnnotations();
    });
  }, [recalculateAnnotations]);

  const fitChart = useCallback(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;
    series.priceScale().setAutoScale(true);
    chart.timeScale().fitContent();
    scheduleAnnotationLayout();
  }, [scheduleAnnotationLayout]);

  useEffect(() => {
    if (!chartContainerRef.current) return undefined;

    const chartContainer = chartContainerRef.current;
    const priceLines = priceLinesRef.current;

    const chart = createChart(chartContainer, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.background },
        textColor: COLORS.muted,
        fontSize: 11,
        fontFamily: SANS,
        attributionLogo: false,
        panes: {
          enableResize: false,
          separatorColor: COLORS.border,
          separatorHoverColor: COLORS.border,
        },
      },
      grid: {
        vertLines: { color: COLORS.grid, style: LineStyle.Dotted, visible: true },
        horzLines: { color: COLORS.grid, style: LineStyle.Dotted, visible: true },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: COLORS.border,
        borderVisible: true,
        minimumWidth: 76,
        scaleMargins: { top: 0.1, bottom: 0.24 },
        textColor: COLORS.muted,
        tickMarkDensity: 3,
        ticksVisible: false,
      },
      leftPriceScale: { visible: false },
      timeScale: {
        barSpacing: 7,
        borderColor: COLORS.border,
        borderVisible: true,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 1,
        rightOffsetPixels: 20,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
        timeVisible: true,
        visible: true,
      },
      crosshair: {
        mode: CrosshairMode.MagnetOHLC,
        vertLine: {
          color: "rgba(199, 207, 222, .38)",
          labelBackgroundColor: "#343B4D",
          labelVisible: true,
          style: LineStyle.Dashed,
          visible: true,
          width: 1,
        },
        horzLine: {
          color: "rgba(199, 207, 222, .38)",
          labelBackgroundColor: "#343B4D",
          labelVisible: true,
          style: LineStyle.Dashed,
          visible: true,
          width: 1,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        // Preserve natural page scrolling on a mobile-first screen.
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      kineticScroll: { mouse: false, touch: true },
      trackingMode: { exitMode: TrackingModeExitMode.OnNextTap },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      autoscaleInfoProvider: baseImplementation => {
        const base = baseImplementation();
        const planRange = autoscaleRangeRef.current;
        if (!base?.priceRange || !planRange) return base;
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, planRange.minimum),
            maxValue: Math.max(base.priceRange.maxValue, planRange.maximum),
          },
        };
      },
      borderVisible: false,
      downColor: COLORS.negative,
      lastValueVisible: false,
      priceLineVisible: false,
      upColor: COLORS.positive,
      wickDownColor: COLORS.negative,
      wickUpColor: COLORS.positive,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(139, 147, 167, .25)",
      lastValueVisible: false,
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    illustrativeMarkersRef.current = createSeriesMarkers(candleSeries, [], {
      autoScale: false,
      zOrder: "top",
    });

    const onCrosshairMove = (param) => {
      const candle = param.seriesData?.get(candleSeries);
      const volume = param.seriesData?.get(volumeSeries);
      if (!param.point || !param.time || !candle || !("open" in candle)) {
        crosshairActiveRef.current = false;
        updateTooltip(latestCandleRef.current);
        return;
      }

      crosshairActiveRef.current = true;
      updateTooltip({
        ...candle,
        time: param.time,
        volume: volume && "value" in volume ? volume.value : 0,
      });
    };

    const onDoubleClick = () => fitChart();
    const onChartInteraction = () => scheduleAnnotationLayout();
    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.subscribeDblClick(onDoubleClick);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onChartInteraction);
    chartContainer.addEventListener("wheel", onChartInteraction, { passive: true });
    chartContainer.addEventListener("pointermove", onChartInteraction, { passive: true });
    chartContainer.addEventListener("touchmove", onChartInteraction, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(onChartInteraction);
    resizeObserver?.observe(chartContainer);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeDblClick(onDoubleClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onChartInteraction);
      chartContainer.removeEventListener("wheel", onChartInteraction);
      chartContainer.removeEventListener("pointermove", onChartInteraction);
      chartContainer.removeEventListener("touchmove", onChartInteraction);
      resizeObserver?.disconnect();
      if (annotationFrameRef.current) cancelAnimationFrame(annotationFrameRef.current);
      illustrativeMarkersRef.current?.detach();
      illustrativeMarkersRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      autoscaleRangeRef.current = null;
      priceLines.clear();
    };
  }, [fitChart, scheduleAnnotationLayout, updateTooltip]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    formatterRef.current = chartPriceFormatter;
    candleSeries.applyOptions({
      priceFormat: {
        type: "custom",
        formatter: chartPriceFormatter,
        minMove: 10 ** -decimals,
        base: 10 ** decimals,
      },
    });

    candleSeries.setData(
      normalizedCandles.map(({ time, open, high, low, close }) => ({
        time,
        open,
        high,
        low,
        close,
      }))
    );
    volumeSeries.setData(
      normalizedCandles.map(({ time, open, close, volume }) => ({
        time,
        value: volume,
        color:
          close >= open ? "rgba(18, 183, 106, .28)" : "rgba(240, 68, 46, .28)",
      }))
    );

    latestCandleRef.current = latestCandle;
    crosshairActiveRef.current = false;
    updateTooltip(latestCandle);

    const count = normalizedCandles.length;
    const interval = count > 1 ? normalizedCandles[1].time - normalizedCandles[0].time : 0;
    const nextDataset = {
      symbol: `${displaySymbol}:${activeValueMode}`,
      count,
      interval,
      firstTime: normalizedCandles[0]?.time ?? null,
      firstClose: normalizedCandles[0]?.close ?? null,
    };
    const previous = previousDatasetRef.current;
    const priceRatio =
      previous?.firstClose > 0 && nextDataset.firstClose > 0
        ? nextDataset.firstClose / previous.firstClose
        : 1;
    const shouldFit =
      count > 0 &&
      (!previous ||
        previous.count === 0 ||
        previous.symbol !== nextDataset.symbol ||
        previous.interval !== nextDataset.interval ||
        Math.abs(previous.count - count) > Math.max(10, previous.count * 0.15) ||
        priceRatio > 3 ||
        priceRatio < 1 / 3);

    previousDatasetRef.current = nextDataset;
    if (shouldFit) requestAnimationFrame(fitChart);
    else scheduleAnnotationLayout();
  }, [activeValueMode, chartPriceFormatter, decimals, displaySymbol, fitChart, latestCandle, normalizedCandles, scheduleAnnotationLayout, updateTooltip]);

  useEffect(() => {
    illustrativeMarkersRef.current?.setMarkers(nativeIllustrativeMarkers);
  }, [nativeIllustrativeMarkers]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const prices = desiredLines.map(line => line.price).filter(price => price > 0);
    autoscaleRangeRef.current = prices.length
      ? { minimum: Math.min(...prices), maximum: Math.max(...prices) }
      : null;
    series?.priceScale().setAutoScale(true);
    scheduleAnnotationLayout();
  }, [desiredLines, scheduleAnnotationLayout]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const existing = priceLinesRef.current;
    const wantedKeys = new Set(desiredLines.map((line) => line.key));

    for (const [key, lineApi] of existing) {
      if (!wantedKeys.has(key)) {
        series.removePriceLine(lineApi);
        existing.delete(key);
      }
    }

    for (const line of desiredLines) {
      const lineApi = existing.get(line.key);
      if (lineApi) lineApi.applyOptions(line.options);
      else existing.set(line.key, series.createPriceLine(line.options));
    }
    scheduleAnnotationLayout();
  }, [desiredLines, scheduleAnnotationLayout]);

  useEffect(() => {
    normalizedPlanRef.current = normalizedPlan;
    scheduleAnnotationLayout();
  }, [normalizedPlan, scheduleAnnotationLayout]);

  const errorMessage = messageFromError(error);
  const state = loading ? "loading" : errorMessage ? "error" : latestCandle ? "ready" : "empty";
  const chartLabel = `${displaySymbol} real price candlestick chart ${activeValueMode === "price" ? "shown in price" : `scaled to implied ${valueModeLabel} using the current supply ratio`}, with ${normalizedCandles.length} OHLCV candles and ${normalizedPlan.legs.length} ${normalizedPlan.mode === "volatility-reference" ? "volatility reference" : "DCA entry"} levels. S1 is a conditional target reference after all planned fills; no sell allocation is modeled. X1 calls for manual reassessment only after a selected-timeframe candle closes below X1; a wick does not count, and X1 is not an automatic stop or executed sale.${displayIllustrativeEvents.length ? ` ${displayIllustrativeEvents.length} retrospective in-sample level intersections are marked as illustrative and non-executed.` : ""}`;

  return (
    <section className="cmvng-dca-chart" aria-labelledby={`${summaryId}-title`}>
      <style>{COMPONENT_CSS}</style>

      <header className="cmvng-dca-chart__head">
        <div className="cmvng-dca-chart__identity">
          <span className="cmvng-dca-chart__eyebrow">
            {activeValueMode === "price" ? "Real pool price OHLCV" : `Real price OHLCV · implied ${valueModeShortLabel}`} · B1–B4 / S1 target ref / X1 close-below reassess
          </span>
          <h4 id={`${summaryId}-title`} className="cmvng-dca-chart__symbol">
            {displaySymbol} / {valueModeShortLabel}
          </h4>
        </div>
        <div className="cmvng-dca-chart__quote">
          <strong className="cmvng-dca-chart__price">
            {currentPrice > 0 ? chartPriceFormatter(currentPrice) : "—"}
          </strong>
          <span className="cmvng-dca-chart__source">
            {state === "ready" && <span className="cmvng-dca-chart__source-dot" />}
            {state === "ready"
              ? valueModeFallback
                ? `${VALUE_MODE_SHORT_LABELS[requestedValueMode]} unavailable · price shown`
                : `${normalizedCandles.length} candles · ${valueModeLabel}`
              : "Waiting for data"}
          </span>
        </div>
      </header>

      <div
        className="cmvng-dca-chart__stage"
        role="group"
        aria-label={chartLabel}
        aria-describedby={`${summaryId}-description`}
      >
        <div ref={chartContainerRef} className="cmvng-dca-chart__canvas" aria-hidden="true" />
        <div
          ref={executionOverlayRef}
          className="cmvng-dca-chart__execution-overlay"
          aria-hidden="true"
        >
          {normalizedPlan.legs.map((leg, index) => {
            const markerId = markerIdForLeg(leg, index);
            return (
              <div
                key={markerId}
                className="cmvng-dca-chart__buy-band"
                data-marker-id={markerId}
                hidden
              >
                <span className="cmvng-dca-chart__buy-badge">
                  <span className="cmvng-dca-chart__action-glyph">+</span>
                  {markerId} · {leg.allocationPct !== null ? `${leg.allocationPct.toFixed(0)}%` : "PLAN"}
                </span>
              </div>
            );
          })}
          {normalizedPlan.target > 0 && (
            <div
              className="cmvng-dca-chart__level-marker cmvng-dca-chart__level-marker--target"
              data-marker-id="S1"
              hidden
            >
              <span className="cmvng-dca-chart__level-badge">
                <span className="cmvng-dca-chart__action-glyph">−</span>
                S1 · TARGET REF
              </span>
            </div>
          )}
          {normalizedPlan.invalidation > 0 && (
            <div
              className="cmvng-dca-chart__level-marker cmvng-dca-chart__level-marker--risk"
              data-marker-id="X1"
              hidden
            >
              <span className="cmvng-dca-chart__level-badge">
                <span className="cmvng-dca-chart__action-glyph">!</span>
                X1 · CLOSE BELOW → REASSESS
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="cmvng-dca-chart__reset"
          onClick={fitChart}
          disabled={!latestCandle}
          aria-label="Reset chart zoom and fit all candles"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 4v5h5M20 20v-5h-5M5.7 15.5A7 7 0 0 0 17.2 18M18.3 8.5A7 7 0 0 0 6.8 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Fit</span>
        </button>

        {state !== "ready" && (
          <div
            className="cmvng-dca-chart__state"
            role={state === "error" ? "alert" : "status"}
            aria-live={state === "error" ? undefined : "polite"}
          >
            <div className="cmvng-dca-chart__state-card">
              {state === "loading" && <div className="cmvng-dca-chart__loader" />}
              <p className="cmvng-dca-chart__state-title">
                {state === "loading"
                  ? "Loading real market candles"
                  : state === "error"
                    ? "Chart unavailable"
                    : "No usable candles yet"}
              </p>
              <p className="cmvng-dca-chart__state-copy">
                {state === "loading"
                  ? "Resolving the pool and preparing OHLCV data."
                  : state === "error"
                    ? errorMessage
                    : "This token needs an active pool and valid OHLCV history before a DCA chart can be drawn."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div ref={tooltipRef} className="cmvng-dca-chart__tooltip" aria-hidden="true">
        {latestCandle
          ? `${formatTime(latestCandle.time)} UTC · OHLCV`
          : "Move across the chart to inspect OHLCV"}
      </div>

      {valueModeFallback && (
        <div className="cmvng-dca-chart__value-notice" role="note">
          <strong>{VALUE_MODE_LABELS[requestedValueMode]} is unavailable.</strong>{" "}
          The chart stayed in price mode; no other valuation was substituted.
        </div>
      )}
      {!valueModeFallback && activeValueMode !== "price" && (
        <div className="cmvng-dca-chart__value-notice" role="note">
          <strong>Implied {valueModeLabel}.</strong>{" "}
          Values use the current valuation-to-price ratio and assume constant token supply.
        </div>
      )}
      {showIllustrativeTouches && (
        <div className="cmvng-dca-chart__touch-notice" role="note">
          <strong>Illustrative historical touches</strong>
          <span>
            Today&apos;s selected plan levels are projected retrospectively onto the same past candles used to build the plan
            {displayIllustrativeEvents.length
              ? ` (${displayIllustrativeEvents.length} level ${displayIllustrativeEvents.length === 1 ? "touch" : "touches"}).`
              : "; no qualifying level touches were found."}{" "}
            The levels were not known then. These in-sample markers are not fills, executed trades, or a backtest.
            S1 remains a conditional target reference with no modeled sell allocation. X1 requires a selected-timeframe candle CLOSE below X1 before manual reassessment; a wick does not count, and X1 is not an automatic stop or executed sale.
          </span>
        </div>
      )}

      <div className="cmvng-dca-chart__legend" role="group" aria-label="Chart line legend">
        {normalizedPlan.legs.length > 0 && (
          <span className="cmvng-dca-chart__key">
            <span
              className="cmvng-dca-chart__key-line cmvng-dca-chart__key-line--dotted"
              style={{ "--key-color": COLORS.dca }}
            />
            {normalizedPlan.mode === "volatility-reference" ? "B1–B4 volatility bands" : "B1–B4 potential buy zones"}
          </span>
        )}
        {normalizedPlan.weightedAverage > 0 && (
          <span className="cmvng-dca-chart__key">
            <span
              className="cmvng-dca-chart__key-line cmvng-dca-chart__key-line--dashed"
              style={{ "--key-color": COLORS.average }}
            />
            Weighted average
          </span>
        )}
        {normalizedPlan.target > 0 && (
          <span className="cmvng-dca-chart__key">
            <span
              className="cmvng-dca-chart__key-line cmvng-dca-chart__key-line--dashed"
              style={{ "--key-color": COLORS.target }}
            />
            S1 conditional target reference after all planned fills · no sell allocation modeled
          </span>
        )}
        {normalizedPlan.invalidation > 0 && (
          <span className="cmvng-dca-chart__key">
            <span
              className="cmvng-dca-chart__key-line cmvng-dca-chart__key-line--dotted"
              style={{ "--key-color": COLORS.invalidation }}
            />
            X1: selected-timeframe candle CLOSE below level → manual reassessment · wick does not count · no automatic stop or executed sale
          </span>
        )}
        {showIllustrativeTouches && (
          <span className="cmvng-dca-chart__key cmvng-dca-chart__key--illustrative">
            <span className="cmvng-dca-chart__action-glyph">↳</span>
            Retrospective in-sample intersection · not executed
          </span>
        )}
        {!normalizedPlan.legs.length && (
          <span className="cmvng-dca-chart__key">
            {normalizedPlan.mode === "blocked"
              ? "Market chart only — DCA overlay unavailable"
              : "DCA levels appear after analysis"}
          </span>
        )}
      </div>

      <footer className="cmvng-dca-chart__attribution">
        <span>TradingView Lightweight Charts™ · Copyright © 2025 TradingView, Inc.</span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView
        </a>
      </footer>

      <div id={summaryId} className="cmvng-dca-chart__sr-only">
        <p><strong>{displaySymbol} accessible chart data</strong></p>
        <p id={`${summaryId}-description`}>
          This historical chart contains {normalizedCandles.length} real OHLCV candles and is shown
          in {valueModeLabel}. The current pool reference is {currentPrice > 0 ? chartPriceFormatter(currentPrice) : "not available"}. It includes{" "}
          {normalizedPlan.legs.length} potential {normalizedPlan.mode === "volatility-reference" ? "volatility reference" : "DCA entry"} levels. These levels are simulations, not
          guaranteed entries or returns. {activeValueMode !== "price"
            ? `The implied ${valueModeLabel.toLowerCase()} values assume a constant token supply.`
            : ""} {valueModeFallback
              ? `${VALUE_MODE_LABELS[requestedValueMode]} was unavailable, so the chart safely fell back to price without substituting another valuation.`
              : ""}
        </p>

        {desiredLines.length > 0 && (
          <table>
            <caption>DCA plan and reference levels</caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">{valueModeLabel}</th>
                <th scope="col">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {desiredLines.map((line) => (
                <tr key={line.key}>
                  <th scope="row">{line.type}</th>
                  <td>{chartPriceFormatter(line.price)}</td>
                  <td>
                    {line.allocation !== null ? `${line.allocation.toFixed(1)} percent` : "Not applicable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showIllustrativeTouches && (
          <section aria-labelledby={`${summaryId}-illustrative-events`}>
            <h4 id={`${summaryId}-illustrative-events`}>Illustrative historical level touches</h4>
            <p>
              The events below apply today&apos;s selected plan levels retrospectively to the same historical sample used to build the plan. The levels were not known then; these are
              not fills, executed trades, or a backtest.
            </p>
            {displayIllustrativeEvents.length > 0 ? (
              <ol>
                {displayIllustrativeEvents.map(event => (
                  <li key={event.id}>
                    <time dateTime={new Date(event.time * 1000).toISOString()}>
                      {formatTime(event.time)} UTC
                    </time>{" "}
                    — {event.label}, at {chartPriceFormatter(event.price)} in {valueModeLabel}.{" "}
                    {event.detail} Illustrative only; not executed.
                  </li>
                ))}
              </ol>
            ) : (
              <p>No qualifying illustrative level touches were found.</p>
            )}
          </section>
        )}

        {accessibleCandles.length > 0 && (
          <table>
            <caption>
              Latest {accessibleCandles.length} of {normalizedCandles.length} OHLCV candles in {valueModeLabel}, oldest to newest
            </caption>
            <thead>
              <tr>
                <th scope="col">UTC time</th>
                <th scope="col">Open ({valueModeShortLabel})</th>
                <th scope="col">High ({valueModeShortLabel})</th>
                <th scope="col">Low ({valueModeShortLabel})</th>
                <th scope="col">Close ({valueModeShortLabel})</th>
                <th scope="col">Volume</th>
              </tr>
            </thead>
            <tbody>
              {accessibleCandles.map((candle) => (
                <tr key={candle.time}>
                  <th scope="row">
                    <time dateTime={new Date(candle.time * 1000).toISOString()}>
                      {formatTime(candle.time)} UTC
                    </time>
                  </th>
                  <td>{chartPriceFormatter(candle.open)}</td>
                  <td>{chartPriceFormatter(candle.high)}</td>
                  <td>{chartPriceFormatter(candle.low)}</td>
                  <td>{chartPriceFormatter(candle.close)}</td>
                  <td>{candle.volume.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
