import { T } from "../../styles/theme.js";
import { imageProxyUrl } from "../../services/api.js";
import {
  compactAddress,
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

function fitText(ctx, text, maxWidth, maxSize, weight = 700, minSize = 11) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = font(size, weight);
    if (ctx.measureText(String(text)).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(String(text)).width <= maxWidth) return String(text);
  let output = String(text);
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }
    if (lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  });
  if (current) lines.push(current);
  if (lines.length) lines[lines.length - 1] = truncateText(ctx, lines.at(-1), maxWidth);
  return lines.slice(0, maxLines);
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
    ctx.font = font(Math.round(size * 0.28), 700);
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

function selectedValue(model, values) {
  if (model.mode === "price") return formatPrice(values?.price);
  return compactValuation(values?.[model.mode]);
}

function plainPercent(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "Unavailable";
  return `${Math.abs(Number(value)).toFixed(digits).replace(/\.0$/, "")}%`;
}

function targetLabel(model) {
  if (!Number.isFinite(model.profitTargetPct)) return "Profit target";
  return `Profit target (+${Math.abs(model.profitTargetPct).toFixed(0)}%)`;
}

function formatDataStamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Time unavailable";
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

function terminalCopy(model) {
  if (model.terminalType.startsWith("target")
    || ["profit", "take-profit", "take_profit"].includes(model.terminalType)) {
    return "The illustrative sample reached the profit target; later buys were paused.";
  }
  if (model.terminalType.startsWith("review")
    || ["risk", "risk-review", "risk_review"].includes(model.terminalType)) {
    return "The illustrative sample reached the risk-review level; later buys were paused.";
  }
  return "If the target is not reached, finish the scheduled buys and review the plan manually.";
}

function drawHeader(ctx, model, image, { x, y, width, scale }) {
  const tokenSize = 66 * scale;
  drawToken(ctx, image, model.token.symbol, x, y, tokenSize);

  ctx.fillStyle = T.ink;
  ctx.font = font(29 * scale, 700);
  ctx.fillText(model.token.symbol, x + 86 * scale, y + 28 * scale);
  ctx.fillStyle = T.ink2;
  const identity = `${model.token.network.toUpperCase()} · CA ${compactAddress(model.token.address, 8, 7)}`;
  ctx.font = font(13 * scale, 600);
  ctx.fillText(truncateText(ctx, identity, width - 250 * scale), x + 86 * scale, y + 54 * scale);

  ctx.textAlign = "right";
  ctx.fillStyle = T.blue;
  ctx.font = font(22 * scale, 700);
  ctx.fillText("cmvng", x + width, y + 25 * scale);
  ctx.fillStyle = T.ink3;
  ctx.font = font(11 * scale, 700);
  ctx.fillText("DCA PLAN", x + width, y + 49 * scale);
  ctx.textAlign = "left";
}

function drawHero(ctx, model, { x, y, width, scale }) {
  fillRoundRect(ctx, x, y, width, 154 * scale, 24 * scale, T.card2);
  fillRoundRect(ctx, x + 18 * scale, y + 16 * scale, 250 * scale, 30 * scale, 15 * scale, T.blueSoft);
  ctx.fillStyle = T.blue;
  ctx.font = font(11 * scale, 700);
  ctx.fillText("ILLUSTRATIVE SIMULATION · NOT A FORECAST", x + 31 * scale, y + 36 * scale);

  ctx.fillStyle = T.ink;
  ctx.font = font(34 * scale, 700);
  ctx.fillText(`${formatUsd(model.totalAmountUsd)} over ${model.durationDays} days`, x + 20 * scale, y + 86 * scale);

  ctx.fillStyle = T.ink2;
  ctx.font = font(15 * scale, 600);
  const schedule = `${model.buyFrequencyLabel} · ${model.plannedBuyCount.toLocaleString()} planned buys · ${formatUsd(model.amountPerBuyUsd)} each`;
  ctx.fillText(truncateText(ctx, schedule, width - 40 * scale), x + 20 * scale, y + 120 * scale);

  ctx.font = font(12 * scale, 600);
  ctx.fillStyle = T.ink3;
  ctx.fillText("No trades are placed by this card.", x + 20 * scale, y + 142 * scale);
}

function drawVolatility(ctx, model, { x, y, width, scale }) {
  fillRoundRect(ctx, x, y, width, 82 * scale, 18 * scale, T.blueSoft);
  ctx.fillStyle = T.blue;
  ctx.font = font(12 * scale, 700);
  ctx.fillText("HISTORICAL VOLATILITY", x + 18 * scale, y + 27 * scale);
  ctx.fillStyle = T.ink;
  ctx.font = font(21 * scale, 700);
  ctx.fillText(`${model.volatilityTier} · ${plainPercent(model.dailySwingPct)} typical daily swing`, x + 18 * scale, y + 58 * scale);
}

function drawFactGrid(ctx, model, { x, y, width, scale, columns = 2 }) {
  const gap = 12 * scale;
  const facts = [
    ["Sample buys shown", `${model.executedSampleBuyCount.toLocaleString()} of ${model.plannedBuyCount.toLocaleString()}`],
    [`Modeled average entry · ${model.modeLabel}`, selectedValue(model, model.averageEntry)],
    [targetLabel(model), selectedValue(model, model.profitTarget)],
    ["Risk review · pause and reassess", selectedValue(model, model.riskReview)],
    ["Unused budget in sample", formatUsd(model.unusedBudgetUsd)],
    ["Display unit", model.valuationAvailable ? model.modeLabel : `${model.modeLabel} unavailable`],
  ];
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = 94 * scale;

  facts.forEach(([label, value], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cardX = x + column * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);
    fillRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 18 * scale, T.card2);
    ctx.fillStyle = T.ink2;
    ctx.font = font(11 * scale, 700);
    ctx.fillText(truncateText(ctx, label, cardWidth - 28 * scale), cardX + 14 * scale, cardY + 25 * scale);
    ctx.fillStyle = label.startsWith("Profit") ? T.gain : label.startsWith("Risk") ? T.loss : T.ink;
    const size = fitText(ctx, value, cardWidth - 28 * scale, 22 * scale, 700, 12 * scale);
    ctx.font = font(size, 700);
    ctx.fillText(truncateText(ctx, value, cardWidth - 28 * scale), cardX + 14 * scale, cardY + 61 * scale);
  });

  return Math.ceil(facts.length / columns) * cardHeight + (Math.ceil(facts.length / columns) - 1) * gap;
}

function drawPlanEnding(ctx, model, { x, y, width, scale }) {
  fillRoundRect(ctx, x, y, width, 74 * scale, 18 * scale, "#EEF7F2");
  ctx.fillStyle = T.ink;
  ctx.font = font(12 * scale, 700);
  ctx.fillText("WHAT HAPPENS NEXT", x + 16 * scale, y + 23 * scale);
  ctx.fillStyle = T.ink2;
  ctx.font = font(12 * scale, 600);
  const lines = wrapLines(ctx, terminalCopy(model), width - 32 * scale, 2);
  lines.forEach((line, index) => ctx.fillText(line, x + 16 * scale, y + (45 + index * 17) * scale));
}

function drawFooter(ctx, model, { x, y, width, scale, expanded = false }) {
  ctx.strokeStyle = T.line;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();

  const quoteStamp = formatDataStamp(model.timestamps.marketDataAsOf);
  const candleStamp = formatDataStamp(model.timestamps.candleDataAsOf);
  const source = `${model.source.provider} · ${model.source.dex} / ${model.source.counterSymbol} · pool ${compactAddress(model.source.poolAddress, 7, 6)}`;
  const rows = [
    `Market snapshot · ${quoteStamp} UTC`,
    `Historical sample through · ${candleStamp} UTC`,
    source,
    `TOKEN CA · ${model.token.address}`,
    "Simulation only · not a forecast, financial advice or an exchange order",
    model.impliedValuation
      ? "MCAP / FDV levels assume the current reported supply ratio"
      : "Price levels are illustrative and are not executable orders",
  ];
  if (expanded) {
    rows.push(`Illustrative plan window · ${formatDataStamp(model.timestamps.planStartsAt)} to ${formatDataStamp(model.timestamps.planEndsAt)} UTC`);
  }
  if (model.warnings.length) rows.push(`DATA NOTE · ${model.warnings.join(" · ")}`);

  rows.forEach((row, index) => {
    ctx.fillStyle = index === 3 ? T.ink2 : T.ink3;
    ctx.font = font((index === 3 ? 9.5 : 9) * scale, index === 3 ? 700 : 600);
    ctx.fillText(truncateText(ctx, row, width), x, y + (20 + index * 14) * scale);
  });
}

export async function makeOnchainShareCard(input) {
  const model = buildOnchainShareModel(input);
  if (!model) throw new Error("A complete scheduled DCA plan is required to generate a card.");
  const format = ONCHAIN_CARD_FORMATS.find(item => item.id === input.format) || ONCHAIN_CARD_FORMATS[0];
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d");
  await waitForFonts();
  const tokenImage = await loadImage(model.token.image);

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = 36;
  fillRoundRect(ctx, margin, margin, canvas.width - margin * 2, canvas.height - margin * 2, 34, T.card);

  if (format.id === "story") {
    const x = 76;
    const width = canvas.width - 152;
    const scale = 1.16;
    drawHeader(ctx, model, tokenImage, { x, y: 82, width, scale });
    drawHero(ctx, model, { x, y: 196, width, scale });
    drawVolatility(ctx, model, { x, y: 398, width, scale });
    const factsHeight = drawFactGrid(ctx, model, { x, y: 520, width, scale, columns: 1 });
    drawPlanEnding(ctx, model, { x, y: 520 + factsHeight + 28, width, scale });

    ctx.fillStyle = T.ink;
    ctx.font = font(20, 700);
    ctx.fillText("How to read this card", x, 1396);
    ctx.fillStyle = T.ink2;
    ctx.font = font(15, 500);
    [
      "Scheduled buys are plotted against an illustrative volatility sample.",
      "The profit target and risk review move with the modeled average entry.",
      "A risk review pauses the sample; it is not an automatic sale or stop order.",
    ].forEach((line, index) => ctx.fillText(line, x, 1432 + index * 28));
    drawFooter(ctx, model, { x, y: 1655, width, scale: 1.12, expanded: true });
  } else {
    const x = 72;
    const width = canvas.width - 144;
    drawHeader(ctx, model, tokenImage, { x, y: 68, width, scale: 1 });
    drawHero(ctx, model, { x, y: 154, width, scale: 1 });
    drawVolatility(ctx, model, { x, y: 326, width, scale: 1 });
    const factsHeight = drawFactGrid(ctx, model, { x, y: 426, width, scale: 1, columns: 2 });
    drawPlanEnding(ctx, model, { x, y: 426 + factsHeight + 16, width, scale: 1 });
    drawFooter(ctx, model, { x, y: 925, width, scale: 1, expanded: false });
  }

  return canvas.toDataURL("image/png");
}
