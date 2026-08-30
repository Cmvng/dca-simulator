import React, { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../lib/analytics.js";
import {
  buildOnchainShareModel,
  ONCHAIN_CARD_FORMATS,
  ONCHAIN_VALUE_MODES,
} from "../lib/sharing/onchainShareModel.js";
import { formatPrice, formatUsd } from "../lib/onchain/formatters.js";
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
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  eyebrow: {
    display: "block",
    color: T.blue,
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
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
    fontSize: 13,
    lineHeight: 1.55,
    margin: "6px 0 0",
    maxWidth: 590,
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 8,
    marginBottom: 18,
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
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  summaryValue: {
    display: "block",
    color: T.ink,
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  controlGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 16,
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
    minHeight: 42,
    border: `1px solid ${active ? T.blue : T.line}`,
    borderRadius: 999,
    background: active ? T.blueSoft : T.card,
    color: active ? T.blue : T.ink2,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: 700,
    padding: "13px 18px",
  },
  preview: {
    display: "block",
    width: "100%",
    maxHeight: 560,
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
    fontSize: 12,
    fontWeight: 700,
    padding: "10px 12px",
  },
  status: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 1.5,
    marginTop: 10,
  },
  disclaimer: {
    color: T.ink2,
    fontFamily: SANS,
    fontSize: 11,
    lineHeight: 1.55,
    margin: "14px 0 0",
  },
};

function safeFilename(symbol, profile, format) {
  const safeSymbol = String(symbol || "token").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const safeProfile = String(profile || "plan").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `cmvng-${safeSymbol}-${safeProfile}-dca-${format}.png`;
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
  profile,
  reviewDays,
  timeframeLabel,
  dataAsOf,
  marketDataAsOf,
  candleDataAsOf,
  valuationWarnings = EMPTY_WARNINGS,
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
  const currentShareUrl = () => shareUrl || (typeof window !== "undefined" ? window.location.href : "");
  const model = useMemo(() => buildOnchainShareModel({
    asset,
    plan,
    profile,
    reviewDays,
    timeframeLabel,
    valueMode: resolvedValueMode,
    dataAsOf,
    marketDataAsOf,
    candleDataAsOf,
    valuationWarnings,
  }), [asset, candleDataAsOf, dataAsOf, marketDataAsOf, plan, profile, resolvedValueMode, reviewDays, timeframeLabel, valuationWarnings]);

  useEffect(() => {
    setValueMode(availableValueMode(initialValueMode, market.marketCapUsd, market.fdvUsd));
  }, [initialValueMode, market.fdvUsd, market.marketCapUsd]);

  useEffect(() => {
    generationVersion.current += 1;
    setCardUrl(null);
    setGenerating(false);
    setMessage("");
  }, [asset, candleDataAsOf, dataAsOf, marketDataAsOf, plan, profile, reviewDays, timeframeLabel, format, resolvedValueMode, valuationWarnings]);

  useEffect(() => () => {
    generationVersion.current += 1;
  }, []);

  if (!model) return null;

  const filename = safeFilename(model.token.symbol, model.profile.id, format);
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
        profile,
        reviewDays,
        timeframeLabel,
        valueMode: resolvedValueMode,
        dataAsOf,
        marketDataAsOf,
        candleDataAsOf,
        valuationWarnings,
        format,
      });
      if (version !== generationVersion.current) return;
      setCardUrl(result);
      setMessage("Card ready. Download it or share it with the live plan link.");
      track("onchain_share_card_generated", { token: model.token.symbol, profile: model.profile.id, format, valueMode: model.mode });
    } catch (error) {
      if (version === generationVersion.current) setMessage(error.message || "The card could not be generated.");
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
    const title = `${model.token.symbol} ${model.profile.label} DCA map`;
    const text = `${formatUsd(model.budget)} budget · ${model.reviewDays}-day review window · B1–B4 potential entries · conditional S1 and X1.`;
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
      if (error.name !== "AbortError") setMessage("Sharing was not available. You can download the card or copy its link.");
    }
  };

  return (
    <section aria-labelledby="onchain-share-title" style={styles.section}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>Shareable analysis card</span>
          <h3 id="onchain-share-title" style={styles.title}>Turn this DCA map into one clean card</h3>
          <p style={styles.copy}>B1–B4, S1, X1, budget, duration and valuation zones stay together when you share the plan.</p>
        </div>
      </header>

      <div style={styles.summary} aria-label="Card summary">
        <div style={styles.summaryItem}><span style={styles.summaryLabel}>Plan</span><strong style={styles.summaryValue}>{model.profile.label}</strong></div>
        <div style={styles.summaryItem}><span style={styles.summaryLabel}>Budget</span><strong style={styles.summaryValue}>{formatUsd(model.budget)}</strong></div>
        <div style={styles.summaryItem}><span style={styles.summaryLabel}>Plan window</span><strong style={styles.summaryValue}>{model.reviewDays}-day review</strong></div>
        <div style={styles.summaryItem}><span style={styles.summaryLabel}>Average entry</span><strong style={styles.summaryValue}>{formatPrice(model.averageEntry)}</strong></div>
      </div>

      <div style={styles.controlGrid}>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={styles.legend}>Show zones primarily in</legend>
          <div style={styles.options}>
            {ONCHAIN_VALUE_MODES.map(option => {
              const unavailable = option.id === "marketCap"
                ? !model.currentMarketCap
                : option.id === "fdv"
                  ? !model.currentFdv
                  : false;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={resolvedValueMode === option.id}
                  disabled={unavailable}
                  onClick={() => setValueMode(option.id)}
                  style={{ ...styles.option(resolvedValueMode === option.id), opacity: unavailable ? 0.45 : 1, cursor: unavailable ? "not-allowed" : "pointer" }}
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

      <button type="button" onClick={generate} disabled={generating} style={{ ...styles.primary, opacity: generating ? 0.6 : 1 }}>
        {generating ? "Generating card…" : "Generate DCA card"}
      </button>

      {cardUrl && (
        <img
          src={cardUrl}
          alt={`${model.token.symbol} ${model.profile.label} DCA share-card preview`}
          style={styles.preview}
        />
      )}

      <div style={styles.actions}>
        {cardUrl && <button type="button" onClick={download} style={styles.secondary}>Download PNG</button>}
        <button type="button" onClick={copyLink} style={styles.secondary}>Copy live link</button>
        {typeof navigator !== "undefined" && navigator.share && (
          <button type="button" onClick={nativeShare} style={styles.secondary}>Share{cardUrl ? " card" : " plan"}</button>
        )}
      </div>

      <div role="status" aria-live="polite" style={styles.status}>{message}</div>
      <p style={styles.disclaimer}>Simulation only. S1 is a conditional target reference after planned fills; no sale size or order is modeled. X1 requires the selected-timeframe candle to close below the level before manual reassessment—it is not an automatic stop. Outcomes assume all planned B zones fill and exclude fees, taxes, slippage and price impact. Implied market-cap and FDV zones use the current reported supply ratio. Verify contract safety and liquidity independently.</p>
    </section>
  );
}
