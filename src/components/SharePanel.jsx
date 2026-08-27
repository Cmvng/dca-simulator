// Share system: 3 card formats × 3 content variants, download, copy shareable
// plan link, X share. Loaded lazily — canvas code stays out of the initial
// bundle. INSTRUMENT: paper ground, hairline top rule, no pills, no emoji.

import React, { useState } from "react";
import { T, SANS, inp, section, body, btnPrimary, btnSecondary, btnOption } from "../styles/theme.js";
import { SectionLabel, Spinner } from "./ui.jsx";
import { makeCard, CARD_FORMATS, CARD_CONTENTS } from "../lib/sharing/shareCard.js";
import { planShareUrl } from "../lib/planUrl.js";
import { track } from "../lib/analytics.js";

export default function SharePanel({ selected, sim, targetPct, months, freqLabel, analysis, livePrice, onSavePlan, onNewPlan, onCompareCoin, planSaved }) {
  const [userName, setUserName] = useState("");
  const [profileImg, setProfileImg] = useState(null);
  const [format, setFormat] = useState("x");
  const [content, setContent] = useState("plan");
  const [genCard, setGenCard] = useState(false);
  const [cardUrl, setCardUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const realityOk = !!sim?.reality?.ok;

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
        format, content, asset: selected, sim, targetPct, months, freqLabel,
        userName: userName.trim(), profileImg, analysis, livePrice,
      });
      setCardUrl(url);
      track("share_card_generated", { coin: selected.id, format, content });
    } catch (e) { console.error("Card generation failed", e); }
    setGenCard(false);
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = `cmvng-${selected.symbol}-dca-${format}.png`;
    a.click();
    setShared(true);
    track("share_clicked", { channel: "download", format, content });
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

  const smallBtn = { ...btnSecondary, flex: 1, minWidth: 110, padding: "10px 12px", fontSize: 13 };
  const optBtn = active => ({ ...btnOption(active), flex: 1, minWidth: 104 });
  const fieldLabel = { fontFamily: SANS, fontSize: 12, fontWeight: 400, color: T.ink2, display: "block", marginBottom: 5 };

  return (
    <section aria-label="Share your plan" style={{ ...section, marginBottom: 14 }}>
      <SectionLabel style={{ marginBottom: 4 }}>share your plan</SectionLabel>
      <div style={{ ...body, marginBottom: 14 }}>
        A card for X, Instagram or Telegram — plus a link that rebuilds this plan.
      </div>

      {/* content picker */}
      <div role="radiogroup" aria-label="Card content" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {CARD_CONTENTS.map(c => {
          const disabled = c.id === "reality" && !realityOk;
          return (
            <button key={c.id} role="radio" aria-checked={content === c.id}
              aria-disabled={disabled || undefined}
              onClick={() => { if (disabled) return; setContent(c.id); setCardUrl(null); }}
              style={{ ...optBtn(content === c.id), ...(disabled ? { opacity: 0.5, cursor: "default" } : null) }}>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* format tabs */}
      <div role="radiogroup" aria-label="Card format" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {CARD_FORMATS.map(f => (
          <button key={f.id} role="radio" aria-checked={format === f.id}
            onClick={() => { setFormat(f.id); setCardUrl(null); }}
            style={optBtn(format === f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label htmlFor="share-name" style={fieldLabel}>Your name on the card (optional)</label>
        <input id="share-name" type="text" placeholder="e.g. Alex or @alex_dca" maxLength={28} value={userName}
          onChange={e => setUserName(e.target.value)} style={inp} />
      </div>

      <label style={{
        display: "block", padding: "11px 14px", background: T.paper,
        border: `1px dashed ${T.line}`, borderRadius: 2, cursor: "pointer",
        fontFamily: SANS, fontSize: 13, fontWeight: 400, color: T.ink2,
        textAlign: "center", marginBottom: 14,
      }}>
        {profileImg ? "Photo added — click to swap" : "Add profile photo (optional, never uploaded anywhere)"}
        <input type="file" accept="image/*" onChange={e => {
          const f = e.target.files[0]; if (!f) return;
          const r = new FileReader(); r.onload = ev => setProfileImg(ev.target.result); r.readAsDataURL(f);
        }} style={{ display: "none" }} />
      </label>

      <button onClick={handleCard} disabled={genCard}
        style={{ ...btnPrimary, opacity: genCard ? 0.55 : 1, cursor: genCard ? "not-allowed" : "pointer", marginBottom: 14 }}>
        {genCard ? <>Generating your card <Spinner /></> : "Generate my card"}
      </button>

      {cardUrl && (
        <img src={cardUrl} alt={`Share card preview: ${selected.symbol.toUpperCase()} DCA plan`}
          style={{ width: "100%", maxHeight: 420, objectFit: "contain", border: `1px solid ${T.line}`, marginBottom: 10 }} />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {cardUrl && <button onClick={download} style={smallBtn}>Download image</button>}
        <button onClick={shareX} style={smallBtn}>Share on X</button>
        <button onClick={copyLink} style={smallBtn}>{copied ? "Copied" : "Copy plan link"}</button>
        {typeof navigator !== "undefined" && navigator.share && <button onClick={nativeShare} style={smallBtn}>Share…</button>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onSavePlan} disabled={planSaved}
          style={{ ...smallBtn, color: planSaved ? T.ink3 : T.ink, cursor: planSaved ? "default" : "pointer" }}>
          {planSaved ? "Plan saved" : "Save this plan"}
        </button>
        {shared && (
          <>
            <button onClick={onNewPlan} style={smallBtn}>Create another plan</button>
            <button onClick={onCompareCoin} style={smallBtn}>Compare another coin</button>
          </>
        )}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: T.ink3, marginTop: 12, lineHeight: 1.6 }}>
        The plan link contains only your plan's settings — no name, photo or personal data.
        Your photo never leaves this device. Cards show simulated scenarios, not promised returns.
      </div>
    </section>
  );
}
