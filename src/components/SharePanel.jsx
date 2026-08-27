// Share system: 3 card formats, download, copy shareable plan link, X share.
// Loaded lazily — canvas code stays out of the initial bundle.

import React, { useState } from "react";
import { G, inp, card } from "../styles/theme.js";
import { Spinner } from "./ui.jsx";
import { makeCard, CARD_FORMATS } from "../lib/sharing/shareCard.js";
import { planShareUrl } from "../lib/planUrl.js";
import { track } from "../lib/analytics.js";

export default function SharePanel({ selected, sim, targetPct, months, freqLabel, analysis, livePrice, onSavePlan, onNewPlan, onCompareCoin, planSaved }) {
  const [userName, setUserName] = useState("");
  const [profileImg, setProfileImg] = useState(null);
  const [format, setFormat] = useState("x");
  const [genCard, setGenCard] = useState(false);
  const [cardUrl, setCardUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const shareUrl = planShareUrl({
    coinId: selected.id, capital: sim.config.capital, freqId: sim.config.freqId,
    months, targetPct, feePct: sim.config.feePct, feeFixed: sim.config.feeFixed,
    slippagePct: sim.config.slippagePct, hybridPct: sim.config.hybridPct,
  });

  const handleCard = async () => {
    if (!sim || !selected || !analysis) return;
    setGenCard(true);
    try {
      const url = await makeCard({
        format, asset: selected, sim, targetPct, months, freqLabel,
        userName: userName.trim(), profileImg, analysis, livePrice,
      });
      setCardUrl(url);
      track("share_card_generated", { coin: selected.id, format });
    } catch (e) { console.error("Card generation failed", e); }
    setGenCard(false);
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = `cmvng-${selected.symbol}-dca-${format}.png`;
    a.click();
    setShared(true);
    track("share_clicked", { channel: "download", format });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true); setShared(true);
      setTimeout(() => setCopied(false), 2000);
      track("share_clicked", { channel: "copy_link" });
    } catch { window.prompt("Copy your plan link:", shareUrl); }
  };

  const shareX = () => {
    const text = `My ${selected.symbol.toUpperCase()} DCA plan on CMVNG — testing a +${targetPct}% scenario`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener");
    setShared(true);
    track("share_clicked", { channel: "x" });
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "My CMVNG DCA plan", url: shareUrl });
      setShared(true);
      track("share_clicked", { channel: "native" });
    } catch { /* user cancelled */ }
  };

  const smallBtn = extra => ({
    flex: 1, minWidth: 110, padding: "11px 8px", borderRadius: 12, cursor: "pointer",
    fontFamily: "inherit", fontSize: 13, fontWeight: 800,
    border: "2px solid #4ADE80", background: "rgba(74,222,128,0.1)", color: "#4ADE80", ...extra,
  });

  return (
    <div style={{ ...card, background: "#052E16", border: "2px solid #4ADE80", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ fontSize: 22 }}>🔥</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#4ADE80", letterSpacing: 0.5 }}>Share your plan</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>Card for X, Instagram or Telegram — plus a link that rebuilds this plan</div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(74,222,128,0.2)", margin: "12px 0" }} />

      {/* format tabs */}
      <div role="radiogroup" aria-label="Card format" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {CARD_FORMATS.map(f => (
          <button key={f.id} role="radio" aria-checked={format === f.id}
            onClick={() => { setFormat(f.id); setCardUrl(null); }}
            style={{
              flex: 1, minWidth: 110, padding: "8px 6px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${format === f.id ? "#4ADE80" : "rgba(74,222,128,0.25)"}`,
              background: format === f.id ? "rgba(74,222,128,0.15)" : "transparent",
              color: format === f.id ? "#4ADE80" : "rgba(255,255,255,0.5)",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label htmlFor="share-name" style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 5 }}>Your name on the card (optional)</label>
        <input id="share-name" type="text" placeholder="e.g. Alex or @alex_dca" maxLength={28} value={userName}
          onChange={e => setUserName(e.target.value)}
          style={{ ...inp, background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(74,222,128,0.3)", color: "#fff" }}
          onFocus={e => e.target.style.borderColor = "#4ADE80"}
          onBlur={e => e.target.style.borderColor = "rgba(74,222,128,0.3)"}
        />
      </div>

      <label style={{ display: "block", padding: "9px 14px", background: "rgba(255,255,255,0.06)", border: "1.5px dashed rgba(74,222,128,0.35)", borderRadius: 10, cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
        {profileImg ? "✅ Photo added — click to swap" : "📷 Add profile photo (optional, never uploaded anywhere)"}
        <input type="file" accept="image/*" onChange={e => {
          const f = e.target.files[0]; if (!f) return;
          const r = new FileReader(); r.onload = ev => setProfileImg(ev.target.result); r.readAsDataURL(f);
        }} style={{ display: "none" }} />
      </label>

      <button onClick={handleCard} disabled={genCard} style={{
        width: "100%", padding: "14px", borderRadius: 12, cursor: genCard ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontSize: 15, fontWeight: 900, border: "none",
        background: genCard ? "#374151" : "#16A34A",
        color: genCard ? "#6B7280" : "#fff",
        boxShadow: genCard ? "none" : "0 4px 20px rgba(22,163,74,0.4)",
        transition: "all 0.2s", marginBottom: 12,
      }}>
        {genCard ? <><Spinner />&nbsp; Generating your card…</> : "⚡ Generate My Card"}
      </button>

      {cardUrl && (
        <img src={cardUrl} alt={`Share card preview: ${selected.symbol.toUpperCase()} DCA plan`}
          style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(74,222,128,0.3)" }} />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {cardUrl && <button onClick={download} style={smallBtn()}>⬇ Download image</button>}
        <button onClick={shareX} style={smallBtn()}>𝕏 Share on X</button>
        <button onClick={copyLink} style={smallBtn()}>{copied ? "✓ Copied!" : "🔗 Copy plan link"}</button>
        {typeof navigator !== "undefined" && navigator.share && <button onClick={nativeShare} style={smallBtn()}>Share…</button>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onSavePlan} disabled={planSaved}
          style={smallBtn({ borderColor: "rgba(255,255,255,0.35)", color: planSaved ? "rgba(255,255,255,0.4)" : "#fff", background: "rgba(255,255,255,0.07)", cursor: planSaved ? "default" : "pointer" })}>
          {planSaved ? "✓ Plan saved" : "💾 Save this plan"}
        </button>
        {shared && (
          <>
            <button onClick={onNewPlan} style={smallBtn({ borderColor: "rgba(255,255,255,0.35)", color: "#fff", background: "rgba(255,255,255,0.07)" })}>Create another plan</button>
            <button onClick={onCompareCoin} style={smallBtn({ borderColor: "rgba(255,255,255,0.35)", color: "#fff", background: "rgba(255,255,255,0.07)" })}>Compare another coin</button>
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 10 }}>
        The plan link contains only your plan's settings — no name, photo or personal data. Cards show simulated scenarios, not promised returns.
      </div>
    </div>
  );
}
