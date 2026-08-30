import { T } from "../../styles/theme.js";
import { imageProxyUrl } from "../../services/api.js";
import {
  compactAddress,
  formatPercent,
  formatPrice,
  formatUsd,
} from "../onchain/formatters.js";
import { buildOnchainShareModel, ONCHAIN_CARD_FORMATS } from "./onchainShareModel.js";

export { buildOnchainShareModel, ONCHAIN_CARD_FORMATS, ONCHAIN_VALUE_MODES } from "./onchainShareModel.js";

const SANS = "'Plus Jakarta Sans', Arial, sans-serif";
const font = (size, weight = 500) => `${weight} ${size}px ${SANS}`;

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, color) {
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function fitText(ctx, text, maxWidth, maxSize, weight = 700, minSize = 12) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = font(size, weight);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = String(text);
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const image = new Image();
    let settled = false;
    let timeout;
    const finish = value => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    timeout = window.setTimeout(() => finish(null), 8_000);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    try {
      image.src = imageProxyUrl(src);
    } catch {
      finish(null);
    }
  });
}

function waitForFonts(timeoutMs = 2_500) {
  return new Promise(resolve => {
    const ready = document.fonts?.ready;
    if (!ready) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    Promise.resolve(ready).then(finish, finish);
  });
}

function drawToken(ctx, image, symbol, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = T.blueSoft;
  ctx.fillRect(x, y, size, size);
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.fillStyle = T.blue;
    ctx.font = font(Math.round(size * 0.3), 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol.slice(0, 4), x + size / 2, y + size / 2);
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function compactValuation(value) {
  return value ? formatUsd(value, { compact: true }) : "Unavailable";
}

function formatDataStamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date).replace("24:", "00:");
}

function valuationRange(model, leg) {
  if (model.mode === "price") return `${formatPrice(leg.priceLower)} – ${formatPrice(leg.priceUpper)}`;
  const lower = leg.valuationLower[model.mode];
  const upper = leg.valuationUpper[model.mode];
  if (!lower || !upper) return "Unavailable";
  return `${compactValuation(lower)} – ${compactValuation(upper)}`;
}

function outcomeValuation(model, valuations, price) {
  if (model.mode === "price") return formatPrice(price);
  return valuations[model.mode] ? compactValuation(valuations[model.mode]) : "Unavailable";
}

function drawHeader(ctx, model, tokenImage, layout) {
  const { x, y, width, scale } = layout;
  drawToken(ctx, tokenImage, model.token.symbol, x, y, 64 * scale);

  ctx.fillStyle = T.ink;
  ctx.font = font(29 * scale, 700);
  ctx.fillText(model.token.symbol, x + 84 * scale, y + 27 * scale);
  ctx.fillStyle = T.ink2;
  const identity = `${model.token.network.toUpperCase()} · CA ${model.token.address}`;
  const identitySize = fitText(ctx, identity, Math.max(240 * scale, width - 270 * scale), 13 * scale, 600, 8 * scale);
  ctx.font = font(identitySize, 600);
  ctx.fillText(identity, x + 84 * scale, y + 53 * scale);

  ctx.textAlign = "right";
  ctx.fillStyle = T.blue;
  ctx.font = font(22 * scale, 700);
  ctx.fillText("cmvng", x + width, y + 24 * scale);
  ctx.fillStyle = T.ink3;
  ctx.font = font(12 * scale, 700);
  ctx.fillText("ONCHAIN DCA MAP", x + width, y + 48 * scale);
  ctx.textAlign = "left";
}

function drawPlanSummary(ctx, model, layout) {
  const { x, y, width, scale } = layout;
  const pillH = 34 * scale;
  const gap = 8 * scale;
  const labels = [
    "PLANNED · NOT EXECUTED",
    `${model.profile.label} plan`,
    `${formatUsd(model.budget)} budget`,
    `${model.reviewDays}-day review`,
    `${model.timeframeLabel} evidence`,
  ];
  let cursor = x;
  ctx.font = font(13 * scale, 700);
  labels.forEach((label, index) => {
    const pillW = Math.min(width, ctx.measureText(label).width + 24 * scale);
    if (cursor + pillW > x + width && index > 0) return;
    fillRoundRect(ctx, cursor, y, pillW, pillH, pillH / 2, index === 0 ? T.blueSoft : T.card2);
    ctx.fillStyle = index === 0 ? T.blue : T.ink2;
    ctx.fillText(label, cursor + 12 * scale, y + 22 * scale);
    cursor += pillW + gap;
  });

  ctx.fillStyle = T.ink;
  ctx.font = font(20 * scale, 700);
  const zoneHeading = model.impliedValuation
    ? `IMPLIED ${model.modeLabel.toUpperCase()} BUY ZONES · NON-EXECUTABLE`
    : "POTENTIAL PRICE BUY ZONES · NON-EXECUTABLE";
  ctx.fillText(zoneHeading, x, y + 70 * scale);
  ctx.fillStyle = T.ink2;
  ctx.font = font(13 * scale, 500);
  const quoteStamp = formatDataStamp(model.marketDataAsOf);
  const context = `Quote snapshot${quoteStamp ? ` ${quoteStamp} UTC` : " · time unavailable"} · Price ${formatPrice(model.currentPrice)} · MCAP ${compactValuation(model.currentMarketCap)} · FDV ${compactValuation(model.currentFdv)}`;
  ctx.fillText(truncateText(ctx, context, width), x, y + 95 * scale);
}

function drawBuyRows(ctx, model, layout) {
  const { x, y, width, rowHeight, scale } = layout;
  model.legs.forEach((leg, index) => {
    const rowY = y + rowHeight * index;
    fillRoundRect(ctx, x, rowY, width, rowHeight - 10 * scale, 18 * scale, T.card2);
    fillRoundRect(ctx, x + 14 * scale, rowY + 15 * scale, 48 * scale, 38 * scale, 19 * scale, T.blue);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(15 * scale, 700);
    ctx.textAlign = "center";
    ctx.fillText(leg.id, x + 38 * scale, rowY + 40 * scale);
    ctx.textAlign = "left";

    ctx.fillStyle = T.ink;
    const primary = valuationRange(model, leg);
    const primarySize = fitText(ctx, primary, width - 226 * scale, 19 * scale, 700, 11 * scale);
    ctx.font = font(primarySize, 700);
    ctx.fillText(primary, x + 78 * scale, rowY + 32 * scale);
    ctx.fillStyle = T.ink2;
    ctx.font = font(12 * scale, 500);
    ctx.fillText(`${formatPrice(leg.priceLower)} – ${formatPrice(leg.priceUpper)} · ${formatPercent(leg.drawdownPct, 0)}`, x + 78 * scale, rowY + 54 * scale);

    ctx.textAlign = "right";
    ctx.fillStyle = T.ink;
    ctx.font = font(17 * scale, 700);
    ctx.fillText(`${leg.allocationPct}%`, x + width - 16 * scale, rowY + 31 * scale);
    ctx.fillStyle = T.ink2;
    ctx.font = font(12 * scale, 600);
    ctx.fillText(formatUsd(leg.amountUsd), x + width - 16 * scale, rowY + 53 * scale);
    ctx.textAlign = "left";
  });
}

function drawOutcomeCards(ctx, model, layout) {
  const { x, y, width, height, scale, stacked } = layout;
  const gap = 12 * scale;
  const cardWidth = stacked ? width : (width - gap) / 2;
  const cardHeight = stacked ? (height - gap) / 2 : height;
  const outcomes = [
    {
      id: "S1",
      label: "Target reference",
      value: outcomeValuation(model, model.targetValuation, model.targetPrice),
      detail: model.targetAlreadyMet
        ? `Conditional after all B fills · +${model.targetPct}% from avg · no sale modeled`
        : `All B fills · +${model.targetPct}% from avg · ${formatUsd(model.targetValue)} value · no sale modeled`,
      color: "#D86B16",
      background: "#FFF4E8",
    },
    {
      id: "X1",
      label: "Close below → reassess",
      value: outcomeValuation(model, model.invalidationValuation, model.invalidationPrice),
      detail: `${model.timeframeLabel} candle close required · manual only · ${formatPercent(model.downsideFromAveragePct, 0)} from avg · not a stop`,
      color: T.loss,
      background: "#FFF0ED",
    },
  ];

  outcomes.forEach((outcome, index) => {
    const cardX = stacked ? x : x + index * (cardWidth + gap);
    const cardY = stacked ? y + index * (cardHeight + gap) : y;
    fillRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 20 * scale, outcome.background);
    fillRoundRect(ctx, cardX + 16 * scale, cardY + 16 * scale, 44 * scale, 32 * scale, 16 * scale, outcome.color);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(13 * scale, 700);
    ctx.textAlign = "center";
    ctx.fillText(outcome.id, cardX + 38 * scale, cardY + 37 * scale);
    ctx.textAlign = "left";
    ctx.fillStyle = outcome.color;
    ctx.font = font(13 * scale, 700);
    ctx.fillText(outcome.label, cardX + 72 * scale, cardY + 36 * scale);
    ctx.fillStyle = T.ink;
    const size = fitText(ctx, outcome.value, cardWidth - 32 * scale, 28 * scale, 700, 14 * scale);
    ctx.font = font(size, 700);
    ctx.fillText(outcome.value, cardX + 16 * scale, cardY + 79 * scale);
    ctx.fillStyle = T.ink2;
    ctx.font = font(11 * scale, 600);
    ctx.fillText(truncateText(ctx, outcome.detail, cardWidth - 32 * scale), cardX + 16 * scale, cardY + 103 * scale);
  });
}

function drawFooter(ctx, model, layout) {
  const { x, y, width, scale } = layout;
  ctx.strokeStyle = T.line;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.fillStyle = T.ink3;
  ctx.font = font(10 * scale, 600);
  const disclaimer = "Simulation · S1 target / X1 close-confirmed manual reassess · all B fills · values before costs";
  ctx.fillText(truncateText(ctx, disclaimer, width * 0.64), x, y + 22 * scale);
  ctx.textAlign = "right";
  ctx.fillStyle = T.blue;
  ctx.font = font(10 * scale, 700);
  const candleStamp = formatDataStamp(model.candleDataAsOf);
  ctx.fillText(`Quality ${model.qualityScore}/100${candleStamp ? ` · candles ${candleStamp} UTC` : " · candle time unavailable"}`, x + width, y + 22 * scale);
  ctx.textAlign = "left";
  ctx.fillStyle = T.ink3;
  ctx.font = font(9 * scale, 600);
  const quoteStamp = formatDataStamp(model.marketDataAsOf);
  const poolSource = `${model.source.provider} quote${quoteStamp ? ` ${quoteStamp} UTC` : " time unavailable"} · ${model.source.dex} / ${model.source.counterSymbol} · pool ${compactAddress(model.source.poolAddress, 7, 6)}`;
  ctx.fillText(truncateText(ctx, poolSource, width), x, y + 39 * scale);
  const contractLine = `TOKEN CA · ${model.token.address}`;
  const contractSize = fitText(ctx, contractLine, width, 9 * scale, 700, 7 * scale);
  ctx.fillStyle = T.ink2;
  ctx.font = font(contractSize, 700);
  ctx.fillText(contractLine, x, y + 55 * scale);
  const assumption = model.valuationWarnings.length
    ? `VALUATION WARNING · ${model.valuationWarnings.join(" · ")}`
    : model.impliedValuation
      ? "IMPLIED VALUATION · constant current supply ratio · conditional and non-executable"
      : "CONDITIONAL REFERENCES · non-executable · verify contract and pool independently";
  ctx.fillStyle = model.valuationWarnings.length ? "#7A3100" : T.ink3;
  ctx.font = font(8.5 * scale, 700);
  ctx.fillText(truncateText(ctx, assumption, width), x, y + 71 * scale);
  ctx.textAlign = "left";
}

export async function makeOnchainShareCard(input) {
  const model = buildOnchainShareModel(input);
  if (!model) throw new Error("A completed onchain DCA plan is required to generate a card.");
  const format = ONCHAIN_CARD_FORMATS.find(item => item.id === input.format) || ONCHAIN_CARD_FORMATS[1];
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d");
  await waitForFonts();
  const tokenImage = await loadImage(model.token.image);

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = format.id === "x" ? 28 : 36;
  fillRoundRect(ctx, margin, margin, canvas.width - margin * 2, canvas.height - margin * 2, 34, T.card);

  if (format.id === "x") {
    const x = 70;
    const width = canvas.width - 140;
    drawHeader(ctx, model, tokenImage, { x, y: 64, width, scale: 0.84 });
    drawPlanSummary(ctx, model, { x, y: 133, width, scale: 0.84 });
    drawBuyRows(ctx, model, { x, y: 235, width: 635, rowHeight: 76, scale: 0.84 });
    drawOutcomeCards(ctx, model, { x: 730, y: 235, width: 400, height: 294, scale: 0.84, stacked: true });
    drawFooter(ctx, model, { x, y: 575, width, scale: 0.84 });
  } else if (format.id === "story") {
    const x = 82;
    const width = canvas.width - 164;
    drawHeader(ctx, model, tokenImage, { x, y: 88, width, scale: 1.22 });
    drawPlanSummary(ctx, model, { x, y: 212, width, scale: 1.22 });
    drawBuyRows(ctx, model, { x, y: 370, width, rowHeight: 145, scale: 1.22 });
    drawOutcomeCards(ctx, model, { x, y: 990, width, height: 390, scale: 1.22, stacked: true });
    ctx.fillStyle = T.ink;
    ctx.font = font(25, 700);
    ctx.fillText("How to read these scenarios", x, 1450);
    ctx.fillStyle = T.ink2;
    ctx.font = font(18, 500);
    ctx.fillText("Each B band is a conditional reference and may never be reached.", x, 1490);
    ctx.fillText("S1 is a target reference after fills; X1 needs a timeframe close below.", x, 1524);
    drawFooter(ctx, model, { x, y: 1772, width, scale: 1.22 });
  } else {
    const x = 76;
    const width = canvas.width - 152;
    drawHeader(ctx, model, tokenImage, { x, y: 72, width, scale: 1 });
    drawPlanSummary(ctx, model, { x, y: 158, width, scale: 1 });
    drawBuyRows(ctx, model, { x, y: 278, width, rowHeight: 92, scale: 1 });
    drawOutcomeCards(ctx, model, { x, y: 668, width, height: 135, scale: 1, stacked: false });
    drawFooter(ctx, model, { x, y: 952, width, scale: 1 });
  }

  return canvas.toDataURL("image/png");
}
