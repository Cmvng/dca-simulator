import React, { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../lib/analytics.js";
import {
  buildOnchainShareModel,
  ONCHAIN_CARD_FORMATS,
  ONCHAIN_VALUE_MODES,
} from "../lib/sharing/onchainShareModel.js";
import { formatPercent, formatUsd } from "../lib/onchain/formatters.js";
import { SANS, T } from "../styles/theme.js";

const EMPTY_WARNINGS = Object.freeze([]);

const styles = {
  section: {
    background: T.card,
    border: `1px solid ${T.line}`,
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 16px 44px -34px rgba(14, 27, 51, 0.44)",
  },
  eyebrow: {
    display: "block",
    color: T.blue,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  title: {
    color: T.ink,
    fontFamily: SANS,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.25,
    margin: 0,
  },
  copy: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 1.55,
    margin: "7px 0 16px",
    maxWidth: 590,
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 8,
    marginBottom: 14,
  },
  summaryItem: {
    background: T.card2,
    borderRadius: 14,
    padding: "11px 12px",
    minWidth: 0,
  },
  summaryLabel: {
    display: "block",
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 3,
  },
  summaryValue: {
    display: "block",
    color: T.ink,
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  details: {
    border: `1px solid ${T.line}`,
    borderRadius: 14,
    background: T.card2,
    marginBottom: 14,
    overflow: "hidden",
  },
  detailsSummary: {
    alignItems: "center",
    color: T.ink,
    cursor: "pointer",
    display: "flex",
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: 700,
    minHeight: 44,
    padding: "0 14px",
  },
  controlGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 14,
    padding: "2px 14px 14px",
  },
  legend: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 7,
  },
  options: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  },
  option: active => ({
    minHeight: 44,
    border: `1px solid ${active ? T.blue : T.line}`,
    borderRadius: 999,
    background: active ? T.blueSoft : T.card,
    color: active ? T.blue : T.ink2,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: active ? 700 : 600,
    padding: "9px 14px",
  }),
  primary: {
    width: "100%",
    minHeight: 50,
    border: 0,
    borderRadius: 15,
    background: T.blue,
    color: "#FFFFFF",
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: 700,
    padding: "13px 18px",
  },
  preview: {
    display: "block",
    width: "100%",
    maxHeight: 620,
    objectFit: "contain",
    background: T.card2,
    border: `1px solid ${T.line}`,
    borderRadius: 18,
    marginTop: 16,
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
    marginTop: 10,
  },
  secondary: {
    minHeight: 44,
    border: `1px solid ${T.line}`,
    borderRadius: 13,
    background: T.card,
    color: T.blue,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 12px",
  },
  status: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 1.5,
    marginTop: 10,
    minHeight: 18,
  },
  disclaimer: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 1.55,
    margin: "10px 0 0",
  },
};

function safeFilename(symbol, format) {
  const safeSymbol = String(symbol || "token").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `cmvng-${safeSymbol}-dca-plan-${format}.png`;
}

async function dataUrlToFile(dataUrl, filename) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: "image/png" });
}

function availableValueMode(preferredMode, marketCapUsd, fdvUsd) {
  if (preferredMode === "price") return "price";
  if (preferredMode === "marketCap") return marketCapUsd ? "marketCap" : "price";
  if (preferredMode === "fdv") return fdvUsd ? "fdv" : "price";
  return marketCapUsd ? "marketCap" : fdvUsd ? "fdv" : "price";
}

export default function OnchainSharePanel({
  asset,
  plan,
  dataAsOf,
  marketDataAsOf,
  candleDataAsOf,
  valuationWarnings = EMPTY_WARNINGS,
  warnings = EMPTY_WARNINGS,
  shareUrl,
  initialValueMode,
}) {
  const market = asset?.market || {};
  const [format, setFormat] = useState("square");
  const [valueMode, setValueMode] = useState(() => availableValueMode(
    initialValueMode,
    market.marketCapUsd,
    market.fdvUsd,
  ));
  const [cardUrl, setCardUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const generationVersion = useRef(0);
  const resolvedValueMode = valueMode === "marketCap" && !market.marketCapUsd
    ? "price"
    : valueMode === "fdv" && !market.fdvUsd
      ? "price"
      : valueMode;
  const model = useMemo(() => buildOnchainShareModel({
    asset,
    plan,
    valueMode: resolvedValueMode,
    dataAsOf,
    marketDataAsOf,
    candleDataAsOf,
    valuationWarnings,
    warnings,
  }), [asset, candleDataAsOf, dataAsOf, marketDataAsOf, plan, resolvedValueMode, valuationWarnings, warnings]);

  useEffect(() => {
    setValueMode(availableValueMode(initialValueMode, market.marketCapUsd, market.fdvUsd));
  }, [initialValueMode, market.fdvUsd, market.marketCapUsd]);

  useEffect(() => {
    generationVersion.current += 1;
    setCardUrl(null);
    setGenerating(false);
    setMessage("");
  }, [asset, candleDataAsOf, dataAsOf, format, marketDataAsOf, plan, resolvedValueMode, valuationWarnings, warnings]);

  useEffect(() => () => {
    generationVersion.current += 1;
  }, []);

  if (!model) return null;

  const filename = safeFilename(model.token.symbol, format);
  const currentShareUrl = () => shareUrl || (typeof window !== "undefined" ? window.location.href : "");

  const generate = async () => {
    if (generating) return;
    const version = generationVersion.current + 1;
    generationVersion.current = version;
    setGenerating(true);
    setMessage("");
    try {
      const { makeOnchainShareCard } = await import("../lib/sharing/onchainShareCard.js");
      const result = await makeOnchainShareCard({
        asset,
        plan,
        valueMode: resolvedValueMode,
        dataAsOf,
        marketDataAsOf,
        candleDataAsOf,
        valuationWarnings,
        warnings,
        format,
      });
      if (version !== generationVersion.current) return;
      setCardUrl(result);
      setMessage("Plan card ready. Download it or share it with the live plan link.");
      track("onchain_share_card_generated", {
        token: model.token.symbol,
        format,
        valueMode: model.mode,
        frequency: model.frequencyId,
      });
    } catch (error) {
      if (version === generationVersion.current) {
        setMessage(error.message || "The card could not be generated.");
      }
    } finally {
      if (version === generationVersion.current) setGenerating(false);
    }
  };

  const download = () => {
    if (!cardUrl) return;
    const anchor = document.createElement("a");
    anchor.href = cardUrl;
    anchor.download = filename;
    anchor.click();
    setMessage("Card downloaded.");
    track("onchain_share_clicked", { channel: "download", format });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentShareUrl());
      setMessage("Live plan link copied.");
      track("onchain_share_clicked", { channel: "copy_link" });
    } catch {
      window.prompt("Copy this live plan link:", currentShareUrl());
    }
  };

  const nativeShare = async () => {
    const targetText = Number.isFinite(model.profitTargetPct)
      ? ` aiming for ${formatPercent(model.profitTargetPct, 0)}`
      : "";
    const title = `${model.token.symbol} scheduled DCA plan`;
    const text = `${formatUsd(model.totalAmountUsd)} over ${model.durationDays} days · ${model.buyFrequencyLabel.toLowerCase()}${targetText}. Illustrative simulation, not a forecast.`;
    const url = currentShareUrl();
    try {
      if (cardUrl) {
        const file = await dataUrlToFile(cardUrl, filename);
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title, text, url, files: [file] });
          track("onchain_share_clicked", { channel: "native_image", format });
          return;
        }
      }
      await navigator.share({ title, text, url });
      track("onchain_share_clicked", { channel: "native_link" });
    } catch (error) {
      if (error.name !== "AbortError") {
        setMessage("Sharing was not available. Download the card or copy its link.");
      }
    }
  };

  return (
    <section aria-labelledby="onchain-share-title" style={styles.section}>
      <span style={styles.eyebrow}>Share your plan</span>
      <h3 id="onchain-share-title" style={styles.title}>Generate a clean DCA plan card</h3>
      <p style={styles.copy}>Share the amount, buy schedule, target and risk review without the technical clutter.</p>

      <div style={styles.summary} aria-label="Card summary">
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Invest</span>
          <strong style={styles.summaryValue}>{formatUsd(model.totalAmountUsd)}</strong>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Schedule</span>
          <strong style={styles.summaryValue}>{model.buyFrequencyLabel} · {model.durationDays} days</strong>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Plan</span>
          <strong style={styles.summaryValue}>{model.plannedBuyCount.toLocaleString()} buys · {formatUsd(model.amountPerBuyUsd)} each</strong>
        </div>
      </div>

      <details style={styles.details}>
        <summary style={styles.detailsSummary}>Card options</summary>
        <div style={styles.controlGrid}>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={styles.legend}>Show levels in</legend>
            <div style={styles.options}>
              {ONCHAIN_VALUE_MODES.map(option => {
                const unavailable = option.id === "marketCap"
                  ? !model.current.marketCap
                  : option.id === "fdv"
                    ? !model.current.fdv
                    : false;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={resolvedValueMode === option.id}
                    disabled={unavailable}
                    onClick={() => setValueMode(option.id)}
                    style={{
                      ...styles.option(resolvedValueMode === option.id),
                      cursor: unavailable ? "not-allowed" : "pointer",
                      opacity: unavailable ? 0.45 : 1,
                    }}
                  >
                    {option.label}{unavailable ? " unavailable" : ""}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={styles.legend}>Card size</legend>
            <div style={styles.options}>
              {ONCHAIN_CARD_FORMATS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={format === option.id}
                  onClick={() => setFormat(option.id)}
                  style={styles.option(format === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      <button
        type="button"
        onClick={generate}
        disabled={generating}
        style={{ ...styles.primary, opacity: generating ? 0.6 : 1 }}
      >
        {generating ? "Generating card…" : "Generate plan card"}
      </button>

      {cardUrl && (
        <img
          src={cardUrl}
          alt={`${model.token.symbol} scheduled DCA plan-card preview`}
          style={styles.preview}
        />
      )}

      {cardUrl && (
        <div style={styles.actions}>
          <button type="button" onClick={download} style={styles.secondary}>Download PNG</button>
          <button type="button" onClick={copyLink} style={styles.secondary}>Copy live link</button>
          {typeof navigator !== "undefined" && navigator.share && (
            <button type="button" onClick={nativeShare} style={styles.secondary}>Share card</button>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" style={styles.status}>{message}</div>
      <p style={styles.disclaimer}>Illustrative simulation only—not a forecast or an order. MCAP and FDV levels assume the current reported supply ratio. Verify contract safety and liquidity independently.</p>
    </section>
  );
}
