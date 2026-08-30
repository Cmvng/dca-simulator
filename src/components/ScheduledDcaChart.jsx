import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  LineType,
  TrackingModeExitMode,
} from "lightweight-charts";
import { formatPrice, formatUsd } from "../lib/onchain/formatters.js";
import { SANS } from "../styles/theme.js";

const VALUE_MODES = new Set(["price", "marketCap", "fdv"]);
const VALUE_MODE_LABELS = {
  price: "Price",
  marketCap: "Market cap",
  fdv: "FDV",
};
const MAX_VISUAL_BUY_MARKERS = 48;
const MAX_ACCESSIBLE_BUYS = 100;

const COLORS = {
  background: "#060914",
  border: "#1D2537",
  grid: "rgba(117, 133, 164, 0.10)",
  text: "#F8FAFF",
  muted: "#929BB0",
  historyUp: "#436854",
  historyDown: "#734A4D",
  sampleUp: "#22C76A",
  sampleDown: "#FF6249",
  buy: "#21D66F",
  average: "#CAD3E4",
  target: "#FF9F2E",
  review: "#FF5144",
};

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
}

function normalizeTime(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1_000);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value > 100_000_000_000 ? value / 1_000 : value);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeTime(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1_000);
  }
  return null;
}

function normalizeCandle(raw) {
  const tuple = Array.isArray(raw);
  const time = normalizeTime(tuple ? raw[0] : raw?.time ?? raw?.timestamp ?? raw?.date);
  const open = finite(tuple ? raw[1] : raw?.open ?? raw?.o);
  const high = finite(tuple ? raw[2] : raw?.high ?? raw?.h);
  const low = finite(tuple ? raw[3] : raw?.low ?? raw?.l);
  const close = finite(tuple ? raw[4] : raw?.close ?? raw?.c);
  if (
    time === null ||
    open === null || high === null || low === null || close === null ||
    open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
    high < Math.max(open, close) || low > Math.min(open, close)
  ) return null;
  return { time, open, high, low, close };
}

function normalizeCandles(candles) {
  const byTime = new Map();
  if (!Array.isArray(candles)) return [];
  candles.forEach(raw => {
    const candle = normalizeCandle(raw);
    if (candle) byTime.set(candle.time, candle);
  });
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function scenarioCandlesFrom(plan) {
  return normalizeCandles(
    plan?.scenario?.candles
    ?? plan?.scenario?.simulatedCandles
    ?? plan?.scenarioCandles
    ?? plan?.simulatedCandles
    ?? [],
  );
}

function buyEventsFrom(plan) {
  const source = plan?.simulatedBuys
    ?? plan?.executedBuys
    ?? plan?.scenario?.simulatedBuys
    ?? plan?.scenario?.executedBuys
    ?? plan?.buys
    ?? [];
  if (!Array.isArray(source)) return [];
  return source.flatMap((buy, index) => {
    const time = normalizeTime(buy?.time ?? buy?.scheduledAt ?? buy?.timestamp ?? buy?.date);
    const price = firstFinite(buy?.price, buy?.priceUsd, buy?.fillPrice, buy?.close);
    if (time === null || !(price > 0)) return [];
    return [{
      ...buy,
      index: index + 1,
      time,
      price,
      amountUsd: firstFinite(buy?.amountUsd, buy?.usdAmount, buy?.amount),
      averageEntry: firstFinite(
        buy?.averageEntry,
        buy?.averageEntryUsd,
        buy?.runningAverageEntry,
        buy?.weightedAverageEntry,
      ),
    }];
  });
}

function scaleFor(plan, market, mode, referencePrice) {
  if (mode === "price") return 1;
  const planScale = plan?.valuationScales?.[mode];
  const planMultiplier = firstFinite(planScale?.multiplier, planScale);
  if (planScale?.available !== false && planMultiplier > 0) return planMultiplier;
  const currentValuation = mode === "marketCap"
    ? firstFinite(market?.marketCapUsd, market?.marketCap)
    : firstFinite(market?.fdvUsd, market?.fdv);
  return currentValuation > 0 && referencePrice > 0 ? currentValuation / referencePrice : null;
}

function scaleCandle(candle, multiplier) {
  return {
    time: candle.time,
    open: candle.open * multiplier,
    high: candle.high * multiplier,
    low: candle.low * multiplier,
    close: candle.close * multiplier,
  };
}

function formatValue(value, mode) {
  return mode === "price" ? formatPrice(value) : formatUsd(value, { compact: true });
}

function terminalType(plan) {
  return String(
    plan?.terminalEvent?.type
    ?? plan?.terminalEvent?.kind
    ?? plan?.terminalEvent?.reason
    ?? plan?.scenario?.terminalEvent?.type
    ?? plan?.scenario?.terminalEvent?.kind
    ?? "",
  ).toLowerCase();
}

function terminalEventFrom(plan) {
  return plan?.terminalEvent ?? plan?.scenario?.terminalEvent ?? null;
}

function nearestSeriesTime(time, candles) {
  if (!candles.length || time === null) return null;
  let best = candles[0].time;
  let distance = Math.abs(best - time);
  for (let index = 1; index < candles.length; index += 1) {
    const nextDistance = Math.abs(candles[index].time - time);
    if (nextDistance < distance) {
      best = candles[index].time;
      distance = nextDistance;
    }
  }
  return best;
}

function groupBuyMarkers(buys, candles) {
  if (!buys.length || !candles.length) return [];
  const groupSize = Math.max(1, Math.ceil(buys.length / MAX_VISUAL_BUY_MARKERS));
  const markers = [];
  for (let start = 0; start < buys.length; start += groupSize) {
    const group = buys.slice(start, start + groupSize);
    const representative = group.at(-1);
    const time = nearestSeriesTime(representative.time, candles);
    if (time === null) continue;
    markers.push({
      time,
      position: "belowBar",
      color: COLORS.buy,
      shape: "circle",
      text: group.length === 1 ? "B" : `B×${group.length}`,
      size: group.length === 1 ? 1.5 : 1.7,
    });
  }
  return markers;
}

function eventMarker(plan, candles) {
  const event = terminalEventFrom(plan);
  const type = terminalType(plan);
  const time = nearestSeriesTime(
    normalizeTime(event?.triggerCandleTime ?? event?.time ?? event?.timestamp ?? event?.date),
    candles,
  );
  if (time === null) return null;
  if (type.includes("target") || type.includes("profit")) {
    return {
      time,
      position: "aboveBar",
      color: COLORS.target,
      shape: "arrowDown",
      text: "S · TARGET CLOSE",
      size: 2,
    };
  }
  if (type.includes("risk") || type.includes("review") || type.includes("downside")) {
    return {
      time,
      position: "aboveBar",
      color: COLORS.review,
      shape: "arrowDown",
      text: "! · REVIEW",
      size: 2,
    };
  }
  return null;
}

function steppedLevelData(buys, key, multiplier, sampleCandles, terminal) {
  const points = buys.flatMap(buy => {
    const time = nearestSeriesTime(buy.time, sampleCandles);
    const value = firstFinite(buy?.[key]);
    return time !== null && value > 0 ? [{ time, value: value * multiplier }] : [];
  });
  if (!points.length || !sampleCandles.length) return points;

  const terminalTime = nearestSeriesTime(
    normalizeTime(terminal?.time ?? terminal?.triggerCandleTime),
    sampleCandles,
  );
  const finalTime = terminalTime ?? sampleCandles.at(-1).time;
  if (finalTime > points.at(-1).time) {
    points.push({ time: finalTime, value: points.at(-1).value });
  }
  return points;
}

function dateTime(value) {
  const time = normalizeTime(value);
  if (time === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(time * 1_000));
}

const chartCss = `
  .cmvng-scheduled-chart {
    overflow: hidden;
    background: ${COLORS.background};
    border: 1px solid ${COLORS.border};
    border-radius: 22px;
    color: ${COLORS.text};
    font-family: ${SANS};
  }
  .cmvng-scheduled-chart__head {
    align-items: flex-start;
    display: flex;
    gap: 14px;
    justify-content: space-between;
    min-height: 76px;
    padding: 16px 18px 12px;
  }
  .cmvng-scheduled-chart__eyebrow {
    color: ${COLORS.buy};
    display: block;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .09em;
    margin-bottom: 5px;
    text-transform: uppercase;
  }
  .cmvng-scheduled-chart__title {
    color: ${COLORS.text};
    font-size: 18px;
    font-weight: 750;
    line-height: 1.2;
    margin: 0;
  }
  .cmvng-scheduled-chart__sample {
    color: ${COLORS.muted};
    font-size: 12px;
    line-height: 1.4;
    margin: 5px 0 0;
  }
  .cmvng-scheduled-chart__fit {
    align-items: center;
    background: #111827;
    border: 1px solid #2B354B;
    border-radius: 12px;
    color: ${COLORS.text};
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font: 700 12px ${SANS};
    justify-content: center;
    min-height: 44px;
    padding: 0 14px;
  }
  .cmvng-scheduled-chart__fit:focus-visible,
  .cmvng-scheduled-chart summary:focus-visible {
    outline: 3px solid #83AEFF;
    outline-offset: 2px;
  }
  .cmvng-scheduled-chart__legend {
    align-items: center;
    border-bottom: 1px solid ${COLORS.border};
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 0 18px 13px;
  }
  .cmvng-scheduled-chart__legend span {
    align-items: center;
    color: ${COLORS.muted};
    display: inline-flex;
    font-size: 11px;
    font-weight: 650;
    gap: 6px;
  }
  .cmvng-scheduled-chart__dot {
    border-radius: 999px;
    display: inline-block;
    height: 8px;
    width: 8px;
  }
  .cmvng-scheduled-chart__dot--history { background: #5C687E; }
  .cmvng-scheduled-chart__dot--sample { background: ${COLORS.sampleUp}; }
  .cmvng-scheduled-chart__dot--buy { background: ${COLORS.buy}; }
  .cmvng-scheduled-chart__dot--average { background: ${COLORS.average}; }
  .cmvng-scheduled-chart__dot--sell { background: ${COLORS.target}; }
  .cmvng-scheduled-chart__dot--review { background: ${COLORS.review}; }
  .cmvng-scheduled-chart__stage { height: clamp(360px, 54vh, 560px); position: relative; }
  .cmvng-scheduled-chart__canvas { height: 100%; width: 100%; }
  .cmvng-scheduled-chart__empty {
    align-items: center;
    background: ${COLORS.background};
    color: ${COLORS.muted};
    display: flex;
    font-size: 14px;
    inset: 0;
    justify-content: center;
    line-height: 1.5;
    padding: 28px;
    position: absolute;
    text-align: center;
    z-index: 2;
  }
  .cmvng-scheduled-chart__details { border-top: 1px solid ${COLORS.border}; }
  .cmvng-scheduled-chart__details summary {
    align-items: center;
    color: #C9D1E1;
    cursor: pointer;
    display: flex;
    font-size: 12px;
    font-weight: 700;
    min-height: 44px;
    padding: 0 18px;
  }
  .cmvng-scheduled-chart__details-body {
    border-top: 1px solid ${COLORS.border};
    color: ${COLORS.muted};
    font-size: 12px;
    line-height: 1.5;
    max-height: 300px;
    overflow: auto;
    padding: 12px 18px 16px;
  }
  .cmvng-scheduled-chart__details-body p { margin: 0 0 10px; }
  .cmvng-scheduled-chart__attribution {
    border-top: 1px solid ${COLORS.border};
    color: ${COLORS.muted};
    font-size: 11px;
    line-height: 1.4;
    padding: 7px 18px 8px;
  }
  .cmvng-scheduled-chart__attribution a { color: #B9C3D6; text-decoration: none; }
  .cmvng-scheduled-chart__attribution a:hover { color: #FFFFFF; text-decoration: underline; }
  .cmvng-scheduled-chart__table { border-collapse: collapse; width: 100%; }
  .cmvng-scheduled-chart__table th,
  .cmvng-scheduled-chart__table td {
    border-bottom: 1px solid ${COLORS.border};
    padding: 8px 6px;
    text-align: left;
  }
  .cmvng-scheduled-chart__table th { color: #C9D1E1; font-weight: 700; }
  @media (max-width: 540px) {
    .cmvng-scheduled-chart { border-radius: 18px; }
    .cmvng-scheduled-chart__head { padding-inline: 13px; }
    .cmvng-scheduled-chart__legend { gap: 8px 11px; padding-inline: 13px; }
    .cmvng-scheduled-chart__stage { height: clamp(340px, 48vh, 450px); }
    .cmvng-scheduled-chart__fit { padding-inline: 11px; }
  }
`;

export default function ScheduledDcaChart({
  historyCandles = [],
  plan = null,
  tokenSymbol = "TOKEN",
  valueMode = "price",
  market = {},
}) {
  const reactId = useId();
  const summaryId = `scheduled-dca-chart-summary-${reactId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const historySeriesRef = useRef(null);
  const sampleSeriesRef = useRef(null);
  const averageSeriesRef = useRef(null);
  const targetSeriesRef = useRef(null);
  const reviewSeriesRef = useRef(null);
  const markerPluginRef = useRef(null);

  const history = useMemo(() => normalizeCandles(historyCandles), [historyCandles]);
  const rawSample = useMemo(() => scenarioCandlesFrom(plan), [plan]);
  const sample = rawSample;
  const rawBuys = useMemo(() => buyEventsFrom(plan), [plan]);
  const referencePrice = firstFinite(
    plan?.quality?.currentPrice,
    plan?.currentPrice,
    history.at(-1)?.close,
    sample[0]?.open,
  );
  const requestedMode = VALUE_MODES.has(valueMode) ? valueMode : "price";
  const requestedScale = scaleFor(plan, market, requestedMode, referencePrice);
  const activeMode = requestedScale > 0 ? requestedMode : "price";
  const valueModeFallback = activeMode !== requestedMode;
  const multiplier = activeMode === requestedMode ? requestedScale : 1;
  const scaledHistory = useMemo(
    () => history.map(candle => scaleCandle(candle, multiplier)),
    [history, multiplier],
  );
  const scaledSample = useMemo(
    () => sample.map(candle => scaleCandle(candle, multiplier)),
    [multiplier, sample],
  );
  const scaledBuys = useMemo(
    () => rawBuys.map(buy => ({
      ...buy,
      price: buy.price * multiplier,
      averageEntry: buy.averageEntry > 0 ? buy.averageEntry * multiplier : null,
    })),
    [multiplier, rawBuys],
  );
  const markerSeriesCandles = scaledSample.length ? scaledSample : scaledHistory;
  const markers = useMemo(() => {
    const visual = groupBuyMarkers(scaledBuys, markerSeriesCandles);
    const terminal = eventMarker(plan, markerSeriesCandles);
    if (terminal) visual.push(terminal);
    return visual.sort((left, right) => left.time - right.time);
  }, [markerSeriesCandles, plan, scaledBuys]);
  const terminal = terminalEventFrom(plan);
  const averageSteps = useMemo(
    () => steppedLevelData(rawBuys, "averageEntryUsd", multiplier, sample, terminal),
    [multiplier, rawBuys, sample, terminal],
  );
  const targetSteps = useMemo(
    () => steppedLevelData(rawBuys, "targetPriceUsd", multiplier, sample, terminal),
    [multiplier, rawBuys, sample, terminal],
  );
  const reviewSteps = useMemo(
    () => steppedLevelData(rawBuys, "reviewPriceUsd", multiplier, sample, terminal),
    [multiplier, rawBuys, sample, terminal],
  );
  const terminalLabel = terminalType(plan).includes("target") || terminalType(plan).includes("profit")
    ? "A sample candle closed at the conditional profit target; no sale is modeled"
    : terminalType(plan).includes("risk") || terminalType(plan).includes("review")
      ? "A sample candle closed at the risk-review level; no sale is modeled"
      : "No conditional target or review level was reached in the sample";

  const formatter = useCallback(
    value => formatValue(value, activeMode),
    [activeMode],
  );

  const fitChart = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        attributionLogo: false,
        background: { type: ColorType.Solid, color: COLORS.background },
        textColor: COLORS.muted,
        fontFamily: SANS,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid, style: LineStyle.Dotted },
        horzLines: { color: COLORS.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        minimumWidth: 76,
        scaleMargins: { top: 0.13, bottom: 0.12 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        barSpacing: 7,
        borderColor: COLORS.border,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 1,
        rightOffset: 5,
        secondsVisible: false,
        timeVisible: true,
      },
      crosshair: {
        mode: CrosshairMode.MagnetOHLC,
        vertLine: { color: "rgba(199, 207, 222, .35)", style: LineStyle.Dashed },
        horzLine: { color: "rgba(199, 207, 222, .35)", style: LineStyle.Dashed },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
      kineticScroll: { mouse: false, touch: true },
      trackingMode: { exitMode: TrackingModeExitMode.OnNextTap },
    });

    const historySeries = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      downColor: COLORS.historyDown,
      lastValueVisible: false,
      priceLineVisible: false,
      upColor: COLORS.historyUp,
      wickDownColor: COLORS.historyDown,
      wickUpColor: COLORS.historyUp,
    });
    const sampleSeries = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      downColor: COLORS.sampleDown,
      lastValueVisible: true,
      priceLineVisible: false,
      upColor: COLORS.sampleUp,
      wickDownColor: COLORS.sampleDown,
      wickUpColor: COLORS.sampleUp,
    });
    const averageSeries = chart.addSeries(LineSeries, {
      color: COLORS.average,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.Dashed,
      lineType: LineType.WithSteps,
      lineWidth: 2,
      priceLineVisible: false,
      title: "AVG",
    });
    const targetSeries = chart.addSeries(LineSeries, {
      color: COLORS.target,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.LargeDashed,
      lineType: LineType.WithSteps,
      lineWidth: 2,
      priceLineVisible: false,
      title: "S TARGET",
    });
    const reviewSeries = chart.addSeries(LineSeries, {
      color: COLORS.review,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      lineStyle: LineStyle.Dotted,
      lineType: LineType.WithSteps,
      lineWidth: 2,
      priceLineVisible: false,
      title: "! REVIEW",
    });
    const markerPlugin = createSeriesMarkers(sampleSeries, [], {
      autoScale: true,
      zOrder: "top",
    });

    chartRef.current = chart;
    historySeriesRef.current = historySeries;
    sampleSeriesRef.current = sampleSeries;
    averageSeriesRef.current = averageSeries;
    targetSeriesRef.current = targetSeries;
    reviewSeriesRef.current = reviewSeries;
    markerPluginRef.current = markerPlugin;

    const onDoubleClick = () => chart.timeScale().fitContent();
    chart.subscribeDblClick(onDoubleClick);

    return () => {
      chart.unsubscribeDblClick(onDoubleClick);
      markerPlugin.detach();
      chart.remove();
      chartRef.current = null;
      historySeriesRef.current = null;
      sampleSeriesRef.current = null;
      averageSeriesRef.current = null;
      targetSeriesRef.current = null;
      reviewSeriesRef.current = null;
      markerPluginRef.current = null;
    };
  }, []);

  useEffect(() => {
    const historySeries = historySeriesRef.current;
    const sampleSeries = sampleSeriesRef.current;
    const averageSeries = averageSeriesRef.current;
    const targetSeries = targetSeriesRef.current;
    const reviewSeries = reviewSeriesRef.current;
    if (!historySeries || !sampleSeries || !averageSeries || !targetSeries || !reviewSeries) return;

    const priceFormat = { type: "custom", minMove: 0.000000000000000001, formatter };
    historySeries.applyOptions({ priceFormat });
    sampleSeries.applyOptions({ priceFormat });
    averageSeries.applyOptions({ priceFormat });
    targetSeries.applyOptions({ priceFormat });
    reviewSeries.applyOptions({ priceFormat });
    historySeries.setData(scaledHistory);
    sampleSeries.setData(scaledSample);
    averageSeries.setData(averageSteps);
    targetSeries.setData(targetSteps);
    reviewSeries.setData(reviewSteps);
    markerPluginRef.current?.setMarkers(markers);
    chartRef.current?.timeScale().fitContent();
  }, [averageSteps, formatter, markers, reviewSteps, scaledHistory, scaledSample, targetSteps]);

  const hasChartData = scaledHistory.length > 0 || scaledSample.length > 0;
  const accessibleBuys = scaledBuys.slice(0, MAX_ACCESSIBLE_BUYS);
  const hiddenBuyCount = Math.max(0, scaledBuys.length - accessibleBuys.length);
  const plannedBuyCount = Math.max(0, Number(plan?.schedule?.purchaseCount) || 0);
  const stoppedBuyCount = Math.max(0, plannedBuyCount - scaledBuys.length);
  const visualBuyMarkerCount = markers.filter(marker => String(marker.text).startsWith("B")).length;
  const symbol = String(tokenSymbol || "TOKEN").toUpperCase();
  const displayedModeLabel = activeMode === "price"
    ? VALUE_MODE_LABELS[activeMode]
    : `Implied ${VALUE_MODE_LABELS[activeMode]}`;

  return (
    <section
      className="cmvng-scheduled-chart"
      aria-labelledby={summaryId}
      aria-describedby={`${summaryId}-description`}
    >
      <style>{chartCss}</style>
      <header className="cmvng-scheduled-chart__head">
        <div>
          <span className="cmvng-scheduled-chart__eyebrow">
            Your DCA path · {displayedModeLabel}
          </span>
          <h3 className="cmvng-scheduled-chart__title" id={summaryId}>
            {symbol} planned buys and conditional levels
          </h3>
          <p className="cmvng-scheduled-chart__sample" id={`${summaryId}-description`}>
            Muted candles are real history. Bright candles are a volatility sample—not a price forecast.
            {" "}Average, target and review lines move after each simulated buy.
            {activeMode !== "price" && ` ${VALUE_MODE_LABELS[activeMode]} values are implied using today’s valuation-to-price ratio, not historical valuation candles.`}
            {valueModeFallback && ` ${VALUE_MODE_LABELS[requestedMode]} was unavailable, so Price is shown.`}
          </p>
        </div>
        <button className="cmvng-scheduled-chart__fit" type="button" onClick={fitChart}>
          Fit chart
        </button>
      </header>

      <div className="cmvng-scheduled-chart__legend" aria-label="Chart legend">
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--history" />History</span>
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--sample" />Sample</span>
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--buy" />B · simulated buy</span>
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--average" />Moving avg entry</span>
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--sell" />S · target close</span>
        <span><i className="cmvng-scheduled-chart__dot cmvng-scheduled-chart__dot--review" />! · risk review</span>
      </div>

      <div className="cmvng-scheduled-chart__stage">
        <div
          className="cmvng-scheduled-chart__canvas"
          ref={containerRef}
          role="img"
          aria-label={hasChartData
            ? `${symbol} DCA simulation chart. ${scaledBuys.length} simulated purchases are grouped into ${visualBuyMarkerCount} visual buy markers; B times a number means that many buys. ${terminalLabel}.`
            : `${symbol} DCA chart. Generate a plan to display scheduled buys.`}
        />
        {!hasChartData && (
          <div className="cmvng-scheduled-chart__empty">
            Generate your plan to see the scheduled buys and conditional levels.
          </div>
        )}
      </div>

      {plan && (
        <details className="cmvng-scheduled-chart__details">
          <summary>View simulated buys reached in this sample</summary>
          <div className="cmvng-scheduled-chart__details-body">
            <p>
              Intended schedule: {plannedBuyCount.toLocaleString("en-US")} buys. This sample reached {scaledBuys.length.toLocaleString("en-US")} simulated buys
              {stoppedBuyCount > 0 ? ` and stopped ${stoppedBuyCount.toLocaleString("en-US")} later buys for review` : ""}.
              {" "}{terminalLabel}. A target or review marker appears only when that level is crossed in this sample.
              {terminal?.time ? ` Sample event: ${dateTime(terminal.time)}.` : ""}
              {visualBuyMarkerCount < scaledBuys.length ? " Grouped B×n markers keep dense schedules readable." : ""}
            </p>
            {accessibleBuys.length > 0 ? (
              <table className="cmvng-scheduled-chart__table">
                <thead>
                  <tr><th>Buy</th><th>Time</th><th>Amount</th><th>{VALUE_MODE_LABELS[activeMode]}</th></tr>
                </thead>
                <tbody>
                  {accessibleBuys.map(buy => (
                    <tr key={`${buy.time}-${buy.index}`}>
                      <td>{buy.index}</td>
                      <td>{dateTime(buy.time)}</td>
                      <td>{buy.amountUsd !== null ? formatUsd(buy.amountUsd) : "—"}</td>
                      <td>{formatValue(buy.price, activeMode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No sample purchases were reached before the review point.</p>
            )}
            {hiddenBuyCount > 0 && <p>Plus {hiddenBuyCount} more scheduled buys.</p>}
          </div>
        </details>
      )}
      <footer className="cmvng-scheduled-chart__attribution">
        Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>
      </footer>
    </section>
  );
}
