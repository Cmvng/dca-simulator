import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── STABLECOINS + WRAPPED ASSETS BLACKLIST (comprehensive) ─────────────────────
const STABLE = new Set([
  // USD-pegged stablecoins
  "tether","usd-coin","binance-usd","dai","true-usd","frax","usdp","neutrino",
  "gemini-dollar","liquity-usd","fei-usd","usdd","celo-dollar","terraclassicusd",
  "paxos-standard","nusd","flex-usd","usdk","husd","usdx","vai","susd","musd",
  "dola-usd","origin-dollar","usdn","sperax-usd","paypal-usd","first-digital-usd",
  "usde","ethena-usde","usdy","mountain-protocol-usdm","ondo-us-dollar-yield",
  "usdb","reserve-rights-token","volt-protocol","float-protocol","fei-protocol",
  "frax-share","terra-luna-2","terrausd","tribe","gyroscope-gyd","crvusd",
  "gho","aave-v3-usdc","raft","deusd","lvusd","letus","zunusd","eura",
  "money-market-hedge","mkr","vesta-finance","e-money","djed",
  // EUR/GBP pegged
  "stasis-eurs","ageur","eurc","euro-coin","tether-eurt","steur","eurs",
  // Wrapped & liquid staking (not real coins — just wrappers)
  "wrapped-bitcoin","wrapped-ethereum","staked-ether","rocket-pool-eth",
  "lido-staked-ether","coinbase-wrapped-staked-eth","mantle-staked-ether",
  "stakewise-v3-oseth","frax-ether","stakehound-staked-ether","wrapped-steth",
  "weth","wbtc","weeth","reth","cbeth","sfrxeth","ankr-staked-eth",
  "sweth","meth","rseth","ezeth","pufeth","apxeth","woeth",
  "wrapped-avax","wrapped-bnb","wrapped-fantom","wrapped-matic","wrapped-near",
  "bridged-usdc-polygon-pos-bridge","bridged-usdt",
]);

// All frequencies now support up to 6 months max
const FREQS = [
  { id:"12h",      label:"Every 12h", days:0.5, maxMonths:6 },
  { id:"daily",    label:"Daily",     days:1,   maxMonths:6 },
  { id:"weekly",   label:"Weekly",    days:7,   maxMonths:6 },
  { id:"biweekly", label:"Bi-weekly", days:14,  maxMonths:6 },
];

const TARGETS = [10, 25, 50, 100, 200];
// ── API BASE — points to your Vercel proxy, not CoinGecko directly ────────────
// The proxy caches all responses server-side so CoinGecko only gets hit once
// per cache window, no matter how many users are on the app simultaneously.
const PROXY = "/api/coins";
const CACHE_TTL = 12 * 60 * 60 * 1000;
const PRICE_TTL = 60 * 1000;

const G = {
  bg:"#F7FDF9", surface:"#FFFFFF", surfaceAlt:"#F0FBF4",
  green:"#16A34A", green2:"#15803D", greenPale:"#DCFCE7", greenBorder:"#BBF7D0",
  dark:"#052E16", text:"#1A2E1A", sub:"#166534", muted:"#6B7280", border:"#E2F5E9",
  red:"#DC2626", redPale:"#FEF2F2", redBorder:"#FECACA",
  amber:"#B45309", amberPale:"#FFFBEB", amberBorder:"#FDE68A",
  blue:"#1D4ED8", bluePale:"#EFF6FF",
};

// ─── CACHE ────────────────────────────────────────────────────────────────────
const cache = {
  get(k,ttl=CACHE_TTL){try{const r=localStorage.getItem("cmv_"+k);if(!r)return null;const{d,t}=JSON.parse(r);return Date.now()-t<ttl?d:null;}catch{return null;}},
  set(k,d){try{localStorage.setItem("cmv_"+k,JSON.stringify({d,t:Date.now()}));}catch{}},
  stale(k){try{const r=localStorage.getItem("cmv_"+k);return r?JSON.parse(r).d:null;}catch{return null;}},
};

// ─── API — TOP 250 via 3 parallel calls ───────────────────────────────────────
async function getCoins() {
  const hit = cache.get("coins250");
  if (hit) return hit;
  try {
    // Single call to your proxy — proxy handles the 3 CoinGecko pages internally
    const res = await fetch(`${PROXY}?type=list`);
    if (!res.ok) throw new Error("Proxy error");
    const top = await res.json();
    cache.set("coins250", top);
    return top;
  } catch {
    const stale = cache.stale("coins250");
    if (stale) return stale;
    throw new Error("Could not load coins. Check your connection and refresh.");
  }
}

async function getLivePrice(id) {
  const hit = cache.get("lp_"+id, PRICE_TTL);
  if (hit) return hit;
  try {
    const r = await fetch(`${PROXY}?type=price&id=${id}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d[id]) return null;
    const result = { price: d[id].usd, change24h: d[id].usd_24h_change || 0 };
    cache.set("lp_"+id, result);
    return result;
  } catch { return null; }
}

async function getHistory(id) {
  const hit = cache.get("h_"+id);
  if (hit) return hit;
  try {
    const r = await fetch(`${PROXY}?type=history&id=${id}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    cache.set("h_"+id, d);
    return d;
  } catch {
    const stale = cache.stale("h_"+id);
    if (stale) return stale;
    throw new Error("Could not load price history.");
  }
}

// ─── MATHS ────────────────────────────────────────────────────────────────────
const avg = a => a.reduce((s,v)=>s+v,0)/a.length;
const std = a => { const m=avg(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };

function analyzeMarket(prices) {
  const vals = prices.map(p=>p[1]);
  const ma30=avg(vals.slice(-30)), ma90=avg(vals.slice(-90));
  const vol30=std(vals.slice(-30)), cur=vals[vals.length-1], oldest=vals[0];
  const volPct=(vol30/cur)*100;
  const momentum=((cur-oldest)/oldest)*100;
  const mn=Math.min(...vals), mx=Math.max(...vals);
  const nearLow=(cur-mn)/(mx-mn||1);
  let trend="Ranging";
  if (cur>ma30*1.02&&ma30>ma90) trend="Uptrend";
  else if (cur<ma30*0.98&&ma30<ma90) trend="Downtrend";
  const score =
    (trend==="Uptrend"?2:trend==="Downtrend"?-2:0)+
    (momentum>20?2:momentum>0?1:momentum>-20?-1:-2)+
    (nearLow<0.35?1:nearLow>0.75?-1:0);
  let verdict, verdictColor, verdictBg, verdictDesc;
  if (score>=3)      { verdict="Strong Setup";  verdictColor=G.green; verdictBg=G.greenPale; verdictDesc="Price action looks solid. Trend and momentum are on your side."; }
  else if (score>=1) { verdict="Decent Setup";  verdictColor=G.blue;  verdictBg=G.bluePale;  verdictDesc="Conditions are okay. DCA helps reduce your timing risk here."; }
  else if (score>=-1){ verdict="Mixed Signals"; verdictColor=G.amber; verdictBg=G.amberPale; verdictDesc="Market is uncertain. Keep position sizes smaller than usual."; }
  else               { verdict="Weak Setup";    verdictColor=G.red;   verdictBg=G.redPale;   verdictDesc="Price action is poor. Expect a tough road before profit."; }
  return { ma30, ma90, vol30, volPct, cur, trend, momentum, nearLow, verdict, verdictColor, verdictBg, verdictDesc, score };
}

function smooth(prices, w=3) {
  return prices.map((_,i) => avg(prices.slice(Math.max(0,i-w+1),i+1).map(x=>x[1])));
}

function runSim({ capital, freqId, months, targetPct, prices, livePrice }) {
  const freq = FREQS.find(f=>f.id===freqId);
  const entries = Math.min(180, Math.max(4, Math.round((months*30)/freq.days)));
  const amtPer = capital/entries;

  // Live price is the anchor — always what user sees right now
  const anchorPrice = livePrice || prices[prices.length-1][1];

  // ── VOLATILITY WINDOW MATCHES CHOSEN DURATION ──────────────────────────────
  // If user picks 3 months → use last 90 days of price data
  // If user picks 1 month  → use last 30 days of price data
  // This means the volatility and price range used for simulation
  // reflects exactly the same period the user is planning to DCA over.
  const windowDays = months * 30;
  const allVals = prices.map(p=>p[1]);
  // Each CoinGecko daily point = 1 day. Slice the last N days.
  const windowVals = allVals.slice(-windowDays);
  const windowPrices = windowVals.length >= 4 ? windowVals : allVals;

  // ── VOLATILITY from the chosen window ──────────────────────────────────────
  const windowAvg = avg(windowPrices);
  const windowStd = std(windowPrices);
  const windowMin = Math.min(...windowPrices);
  const windowMax = Math.max(...windowPrices);
  // Volatility as % of the window average price
  const volPct = (windowStd / windowAvg);

  // ── SIMULATE ENTRY PRICES ──────────────────────────────────────────────────
  // We take the actual historical prices from the window and scale them
  // so they are centred on today's live price.
  // This preserves the real shape of price movement (dips, peaks, patterns)
  // but anchors the whole range to where the coin is trading NOW.
  //
  // Example: window had prices from $30–$50 with avg $40, live price = $60
  //   → each historical price is scaled by (60/40) = 1.5
  //   → so the simulated range becomes $45–$75 centred on $60
  //
  // This is honest: it uses the actual volatility of the chosen period
  // but does not use stale absolute prices as entry points.
  const scaleFactor = anchorPrice / (windowAvg || anchorPrice);
  const step = Math.max(1, Math.floor(windowPrices.length / entries));
  const entryPrices = Array.from({length:entries}, (_,i) => {
    const idx = Math.min(i * step, windowPrices.length - 1);
    const scaled = windowPrices[idx] * scaleFactor;
    return Math.max(scaled, anchorPrice * 0.01);
  });

  const totalTokens = entryPrices.reduce((s,p)=>s+amtPer/p, 0);
  const avgEntry = capital/totalTokens;
  const refPrice = anchorPrice;

  // Target, flat and downside all calculated from LIVE PRICE (not avg entry)
  const targetPrice = refPrice*(1+targetPct/100);
  const targetVal = totalTokens*targetPrice;
  const currentVal = totalTokens*refPrice;
  const downVal = totalTokens*(refPrice*0.8);
  const down50Val = totalTokens*(refPrice*0.5);

  // Expose window stats for display
  const simLow  = Math.min(...entryPrices);
  const simHigh = Math.max(...entryPrices);

  return {
    entries, amtPer, avgEntry, totalTokens, refPrice,
    targetPrice, targetVal,
    targetProfit: targetVal-capital,
    targetROI: ((targetVal-capital)/capital)*100,
    currentVal, currentROI: ((currentVal-capital)/capital)*100,
    flatVal: capital,
    downVal, downLoss: downVal-capital,
    down50Val, down50Loss: down50Val-capital,
    simLow, simHigh, volPct: volPct*100, windowDays,
  };
}

// ─── FORMAT ───────────────────────────────────────────────────────────────────
const fmtUSD = n => {
  const a=Math.abs(n), s=n<0?"-":"";
  if (a>=1e6) return `${s}$${(a/1e6).toFixed(2)}M`;
  if (a>=1e3) return `${s}$${a.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
  return `${s}$${a.toFixed(2)}`;
};
const fmtPrice = n => n>=1000?`$${n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:n>=1?`$${n.toFixed(2)}`:`$${n.toPrecision(4)}`;
const fmtPct = n => `${n>=0?"+":""}${n.toFixed(1)}%`;
const fmtTok = n => n<0.001?n.toFixed(8):n<1?n.toFixed(4):n<1000?n.toFixed(3):n.toFixed(1);

// ─── CANVAS CARD — 1200×675 landscape (perfect for X feed) ───────────────────
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

// Load any image — external CoinGecko URLs are routed through the proxy
// to bypass CORS restrictions that prevent canvas from drawing them directly.
function loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const isCoinGecko = src.includes("coingecko.com");
    const url = isCoinGecko ? `${PROXY}?type=image&url=${encodeURIComponent(src)}` : src;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = url;
  });
}

async function makeCard({ asset, sim, targetPct, months, freqId, userName, profileImg, analysis, livePrice }) {
  const W=1200, H=675, cv=document.createElement("canvas");
  cv.width=W; cv.height=H;
  const ctx = cv.getContext("2d");
  const freq = FREQS.find(f=>f.id===freqId);
  const good = analysis.score>=1;
  const totalInvested = sim.amtPer*sim.entries;
  const LP = Math.round(W*0.36); // left green panel width
  const RX = LP+1, RW = W-LP, PAD = 38;

  // ── BG ──
  ctx.fillStyle="#F0FDF4"; ctx.fillRect(0,0,W,H);

  // ── LEFT GREEN PANEL ──
  ctx.fillStyle="#16A34A"; ctx.fillRect(0,0,LP,H);
  ctx.fillStyle="rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.arc(LP*0.1,H*0.9,220,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.04)"; ctx.beginPath(); ctx.arc(LP*0.9,-20,180,0,Math.PI*2); ctx.fill();

  // CMVNG brand top-left
  ctx.fillStyle="rgba(255,255,255,0.95)"; ctx.font="bold 24px Arial"; ctx.textAlign="left";
  ctx.fillText("CMVNG", 24, 40);
  ctx.fillStyle="rgba(255,255,255,0.4)"; ctx.font="13px Arial";
  ctx.fillText("DCA Simulator", 24, 58);

  const liveP = livePrice?.price || asset.current_price;
  const panelCX = LP/2;

  // ── LARGE PFP — top half of left panel ──
  if (profileImg) {
    const PFP_R = 80; // radius — large and prominent
    const PFP_Y = H*0.30;
    const pimg = await loadImg(profileImg);
    if (pimg) {
      // white border ring
      ctx.fillStyle="rgba(255,255,255,0.25)";
      ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R+6, 0, Math.PI*2); ctx.fill();
      // clip and draw
      ctx.save(); ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R, 0, Math.PI*2); ctx.clip();
      ctx.drawImage(pimg, panelCX-PFP_R, PFP_Y-PFP_R, PFP_R*2, PFP_R*2);
      ctx.restore();
      // green border
      ctx.strokeStyle="#4ADE80"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(panelCX, PFP_Y, PFP_R+6, 0, Math.PI*2); ctx.stroke();
    }
    // name under PFP
    if (userName) {
      ctx.fillStyle="#FFFFFF"; ctx.font="bold 20px Arial"; ctx.textAlign="center";
      ctx.fillText(userName, panelCX, PFP_Y+PFP_R+26);
      ctx.fillStyle="rgba(255,255,255,0.5)"; ctx.font="13px Arial";
      ctx.fillText("DCA Strategy", panelCX, PFP_Y+PFP_R+44);
    }
    // ── TOKEN LOGO — bottom half ──
    const TL_Y = H*0.68;
    if (asset.image) {
      const logo = await loadImg(asset.image);
      if (logo) {
        ctx.save(); ctx.beginPath(); ctx.arc(panelCX, TL_Y, 36, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(logo, panelCX-36, TL_Y-36, 72, 72); ctx.restore();
      }
    }
    ctx.strokeStyle="rgba(255,255,255,0.2)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(panelCX, TL_Y, 40, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle="#FFFFFF"; ctx.font="bold 36px Arial"; ctx.textAlign="center";
    ctx.fillText(asset.symbol.toUpperCase(), panelCX, TL_Y+60);
    ctx.fillStyle="rgba(255,255,255,0.55)"; ctx.font="14px Arial";
    ctx.fillText(asset.name, panelCX, TL_Y+80);
    ctx.fillStyle="#FFFFFF"; ctx.font="bold 22px Arial";
    ctx.fillText(fmtPrice(liveP), panelCX, TL_Y+108);
  } else {
    // No PFP — token logo is the hero, large and centred
    const TL_Y = H*0.38;
    const TL_R = 70;
    if (asset.image) {
      const logo = await loadImg(asset.image);
      if (logo) {
        ctx.save(); ctx.beginPath(); ctx.arc(panelCX, TL_Y, TL_R, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(logo, panelCX-TL_R, TL_Y-TL_R, TL_R*2, TL_R*2); ctx.restore();
      }
    }
    ctx.strokeStyle="rgba(255,255,255,0.2)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(panelCX, TL_Y, TL_R+6, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle="#FFFFFF"; ctx.font="bold 56px Arial"; ctx.textAlign="center";
    ctx.fillText(asset.symbol.toUpperCase(), panelCX, TL_Y+TL_R+58);
    ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.font="17px Arial";
    ctx.fillText(asset.name, panelCX, TL_Y+TL_R+82);
    ctx.fillStyle="#FFFFFF"; ctx.font="bold 26px Arial";
    ctx.fillText(fmtPrice(liveP), panelCX, TL_Y+TL_R+118);
    if (userName) {
      ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.font="bold 15px Arial";
      ctx.fillText(userName, panelCX, TL_Y+TL_R+144);
    }
  }

  // 24h change pill
  if (livePrice?.change24h!==undefined) {
    const chg=livePrice.change24h, up=chg>=0;
    const chgTxt=`${fmtPct(chg)} today`;
    const tw=ctx.measureText(chgTxt).width+22;
    const pillY = H-100;
    rr(ctx,panelCX-tw/2,pillY,tw,28,14);
    ctx.fillStyle=up?"rgba(255,255,255,0.2)":"rgba(220,38,38,0.5)"; ctx.fill();
    ctx.fillStyle="#FFFFFF"; ctx.font="bold 14px Arial"; ctx.textAlign="center";
    ctx.fillText(chgTxt, panelCX, pillY+19);
  }

  // trend badge bottom
  const trendColor=analysis.trend==="Uptrend"?"#4ADE80":analysis.trend==="Downtrend"?"#FCA5A5":"#FDE68A";
  ctx.fillStyle=trendColor; ctx.font="bold 15px Arial"; ctx.textAlign="center";
  ctx.fillText(analysis.trend.toUpperCase(), panelCX, H-64);
  ctx.fillStyle="rgba(255,255,255,0.4)"; ctx.font="12px Arial";
  const vLabel=analysis.score>=3?"Strong Setup":analysis.score>=1?"Decent Setup":analysis.score>=-1?"Mixed Signals":"Weak Setup";
  ctx.fillText(vLabel, panelCX, H-46);

  // ── RIGHT WHITE PANEL ──

  // plan header
  ctx.fillStyle=G.dark; ctx.font="bold 15px Arial"; ctx.textAlign="left";
  ctx.fillText("MY DCA PLAN", RX+PAD, 46);
  const planTxt=`${fmtUSD(sim.amtPer)} ${freq.label.toLowerCase()} · ${months} month${months>1?"s":""} · ${sim.entries} buys · ${fmtUSD(totalInvested)} total`;
  ctx.fillStyle="#6B7280"; ctx.font="14px Arial";
  ctx.fillText(planTxt, RX+PAD, 68);
  // separator
  ctx.strokeStyle="#E2F5E9"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(RX+PAD,82); ctx.lineTo(W-PAD,82); ctx.stroke();

  // target label
  ctx.fillStyle=good?"#16A34A":"#DC2626"; ctx.font="bold 14px Arial"; ctx.textAlign="left";
  ctx.fillText(`IF ${asset.symbol.toUpperCase()} HITS +${targetPct}%  →  ${fmtPrice(sim.targetPrice)}`, RX+PAD, 110);

  // BIG NUMBER
  ctx.fillStyle=G.dark; ctx.font="bold 84px Arial";
  ctx.fillText(fmtUSD(sim.targetVal), RX+PAD, 202);

  // profit + ROI pill on same row
  ctx.fillStyle=good?"#16A34A":"#DC2626"; ctx.font="bold 20px Arial";
  const profitTxt=`Profit: +${fmtUSD(sim.targetProfit)}`;
  ctx.fillText(profitTxt, RX+PAD, 234);
  const profW=ctx.measureText(profitTxt).width;
  const roiTxt=`+${sim.targetROI.toFixed(0)}% return`;
  const roiW=ctx.measureText(roiTxt).width+24;
  rr(ctx,RX+PAD+profW+14,215,roiW,26,13);
  ctx.fillStyle=good?"#16A34A":"#DC2626"; ctx.fill();
  ctx.fillStyle="#fff"; ctx.font="bold 13px Arial";
  ctx.fillText(roiTxt, RX+PAD+profW+26, 233);

  // separator
  ctx.strokeStyle="#E2F5E9"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(RX+PAD,252); ctx.lineTo(W-PAD,252); ctx.stroke();

  // scenarios header
  ctx.fillStyle="#9CA3AF"; ctx.font="bold 11px Arial"; ctx.textAlign="left";
  ctx.fillText("OTHER SCENARIOS", RX+PAD, 272);

  // 3 scenario columns
  const colW=(RW-PAD*2)/3;
  [
    {label:"Price stays flat", val:sim.flatVal, change:"±0%", note:"Breakeven", c:"#B45309", bg:"#FFFBEB", brd:"#FDE68A"},
    {label:`Drops 20%`, val:sim.downVal, change:"-20%", note:`−${fmtUSD(Math.abs(sim.downLoss))}`, c:"#DC2626", bg:"#FEF2F2", brd:"#FECACA"},
    {label:`Crashes 50%`, val:sim.down50Val, change:"-50%", note:`−${fmtUSD(Math.abs(sim.down50Loss))}`, c:"#9F1239", bg:"#FFF1F2", brd:"#FDA4AF"},
  ].forEach((sc,i)=>{
    const sx=RX+PAD+i*colW, sy=282, sw=colW-10, sh=138;
    rr(ctx,sx,sy,sw,sh,10); ctx.fillStyle=sc.bg; ctx.fill();
    ctx.strokeStyle=sc.brd; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle=sc.c; ctx.font="bold 11px Arial"; ctx.textAlign="left";
    ctx.fillText(sc.label, sx+12, sy+22);
    ctx.fillStyle=G.dark; ctx.font="bold 28px Arial";
    ctx.fillText(fmtUSD(sc.val), sx+12, sy+64);
    ctx.fillStyle=sc.c; ctx.font="bold 15px Arial";
    ctx.fillText(sc.change, sx+12, sy+90);
    ctx.fillStyle="#6B7280"; ctx.font="13px Arial";
    ctx.fillText(sc.note, sx+12, sy+112);
  });

  // current value + avg entry bar
  const infoY=438;
  rr(ctx,RX+PAD,infoY,RW-PAD*2,56,8);
  ctx.fillStyle="#F8FAFC"; ctx.fill(); ctx.strokeStyle="#E2F5E9"; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle="#9CA3AF"; ctx.font="bold 11px Arial"; ctx.textAlign="left";
  ctx.fillText("VALUE AT LIVE PRICE", RX+PAD+14, infoY+18);
  ctx.fillStyle=G.dark; ctx.font="bold 21px Arial";
  ctx.fillText(fmtUSD(sim.currentVal), RX+PAD+14, infoY+44);
  const mid=RX+PAD+(RW-PAD*2)/2;
  ctx.strokeStyle="#E2F5E9"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(mid,infoY+8); ctx.lineTo(mid,infoY+48); ctx.stroke();
  ctx.fillStyle="#9CA3AF"; ctx.font="bold 11px Arial"; ctx.textAlign="left";
  ctx.fillText("AVG ENTRY PRICE", mid+14, infoY+18);
  ctx.fillStyle=G.dark; ctx.font="bold 21px Arial";
  ctx.fillText(fmtPrice(sim.avgEntry), mid+14, infoY+44);

  // footer
  ctx.fillStyle="#CBD5E1"; ctx.font="12px Arial"; ctx.textAlign="left";
  ctx.fillText("Not financial advice · DYOR", RX+PAD, H-18);
  ctx.fillStyle="#16A34A"; ctx.font="bold 12px Arial"; ctx.textAlign="right";
  ctx.fillText("cmvng.app", W-PAD, H-18);
  // left panel footer
  ctx.fillStyle="rgba(255,255,255,0.2)"; ctx.font="11px Arial"; ctx.textAlign="center";
  ctx.fillText("Not financial advice · DYOR", LP/2, H-18);

  return cv.toDataURL("image/png");
}

// ─── SMALL UI COMPONENTS ──────────────────────────────────────────────────────
function Dot() {
  return (
    <span style={{width:8,height:8,borderRadius:"50%",background:G.green,display:"inline-block",animation:"pulse 1.2s infinite"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </span>
  );
}

// Coin logo <img> — routes through proxy to fix CORS on canvas
// For regular <img> tags in the UI, direct URLs work fine.
// This component just adds a fallback initials circle if the image fails.
function CoinImg({ src, symbol, size=30 }) {
  const [err, setErr] = React.useState(false);
  if (err || !src) {
    return (
      <div style={{width:size,height:size,borderRadius:"50%",background:G.greenPale,border:`1px solid ${G.greenBorder}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:size*0.38,fontWeight:800,color:G.green}}>
        {(symbol||"?").slice(0,2).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={symbol} style={{width:size,height:size,borderRadius:"50%",flexShrink:0,objectFit:"cover"}} onError={()=>setErr(true)}/>;
}
function Spinner() {
  return (
    <span style={{display:"inline-flex",gap:5,alignItems:"center"}}>
      {[0,1,2].map(i=>(
        <span key={i} style={{width:7,height:7,borderRadius:"50%",background:"#fff",display:"inline-block",animation:`bop 0.7s ${i*0.15}s infinite alternate`}}/>
      ))}
      <style>{`@keyframes bop{from{transform:translateY(0)}to{transform:translateY(-5px)}}`}</style>
    </span>
  );
}
function TrendPill({trend}) {
  const map={Uptrend:[G.green,G.greenPale,G.greenBorder],Downtrend:[G.red,G.redPale,G.redBorder],Ranging:[G.amber,G.amberPale,G.amberBorder]};
  const [c,bg,b]=map[trend]||map.Ranging;
  return <span style={{background:bg,color:c,border:`1px solid ${b}`,borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700}}>{trend}</span>;
}
function PctBadge({val}) {
  const up=val>=0;
  return <span style={{background:up?G.greenPale:G.redPale,color:up?G.green:G.red,border:`1px solid ${up?G.greenBorder:G.redBorder}`,borderRadius:20,padding:"2px 10px",fontSize:13,fontWeight:700}}>{fmtPct(val)}</span>;
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const inp = {width:"100%",boxSizing:"border-box",border:`1.5px solid ${G.border}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"inherit",color:G.text,background:G.surfaceAlt,outline:"none",transition:"border-color 0.15s"};
const card = {background:G.surface,border:`1px solid ${G.border}`,borderRadius:18,padding:"22px",marginBottom:14,boxShadow:"0 1px 4px rgba(22,163,74,0.05)"};
const secLabel = {fontSize:12,fontWeight:800,color:G.green,letterSpacing:2,textTransform:"uppercase",marginBottom:14,display:"flex",alignItems:"center",gap:7};
const stepNum = {width:20,height:20,borderRadius:"50%",background:G.green,color:"#fff",fontSize:11,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0};
const statRow = {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${G.border}`};

// ─── SHARE CARD MODAL/PANEL ───────────────────────────────────────────────────
function SharePanel({ selected, sim, targetPct, months, freqId, analysis, livePrice }) {
  const [userName, setUserName] = useState("");
  const [profileImg, setProfileImg] = useState(null);
  const [genCard, setGenCard] = useState(false);
  const [cardUrl, setCardUrl] = useState(null);

  const handleCard = async () => {
    if (!sim||!selected||!analysis) return;
    setGenCard(true);
    try {
      const url = await makeCard({ asset:selected, sim, targetPct, months, freqId, userName:userName.trim(), profileImg, analysis, livePrice });
      setCardUrl(url);
    } catch(e) { console.error(e); }
    setGenCard(false);
  };

  return (
    <div style={{...card, background:"#052E16", border:"2px solid #4ADE80", marginBottom:14}}>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <span style={{fontSize:22}}>🔥</span>
        <div>
          <div style={{fontSize:15,fontWeight:900,color:"#4ADE80",letterSpacing:0.5}}>Share Your Strategy</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:1}}>Generate a card optimised for X — takes 2 seconds</div>
        </div>
      </div>

      <div style={{height:1,background:"rgba(74,222,128,0.2)",margin:"12px 0"}}/>

      {/* name input */}
      <div style={{marginBottom:10}}>
        <label style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.6)",display:"block",marginBottom:5}}>Your name on the card</label>
        <input type="text" placeholder="e.g. Alex or @alex_dca" maxLength={28} value={userName}
          onChange={e=>setUserName(e.target.value)}
          style={{...inp, background:"rgba(255,255,255,0.08)", border:"1.5px solid rgba(74,222,128,0.3)", color:"#fff"}}
          onFocus={e=>e.target.style.borderColor="#4ADE80"}
          onBlur={e=>e.target.style.borderColor="rgba(74,222,128,0.3)"}
        />
      </div>

      {/* photo upload */}
      <label style={{display:"block",padding:"9px 14px",background:"rgba(255,255,255,0.06)",border:"1.5px dashed rgba(74,222,128,0.35)",borderRadius:10,cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:13,textAlign:"center",marginBottom:12}}>
        {profileImg ? "✅ Photo added — click to swap" : "📷 Add profile photo (optional)"}
        <input type="file" accept="image/*" onChange={e=>{
          const f=e.target.files[0]; if(!f)return;
          const r=new FileReader(); r.onload=ev=>setProfileImg(ev.target.result); r.readAsDataURL(f);
        }} style={{display:"none"}}/>
      </label>

      {/* generate button */}
      <button onClick={handleCard} disabled={genCard} style={{
        width:"100%",padding:"14px",borderRadius:12,cursor:genCard?"not-allowed":"pointer",
        fontFamily:"inherit",fontSize:15,fontWeight:900,border:"none",
        background:genCard?"#374151":"#16A34A",
        color:genCard?"#6B7280":"#fff",
        boxShadow:genCard?"none":"0 4px 20px rgba(22,163,74,0.4)",
        transition:"all 0.2s",marginBottom:12,
      }}>
        {genCard ? <><Spinner/>&nbsp; Generating your card…</> : "⚡ Generate My Card"}
      </button>

      {/* card preview + download */}
      {cardUrl && (
        <div>
          <img src={cardUrl} alt="Your share card" style={{width:"100%",borderRadius:10,marginBottom:10,border:"1px solid rgba(74,222,128,0.3)"}}/>
          <button onClick={()=>{const a=document.createElement("a");a.href=cardUrl;a.download=`cmvng-${selected.symbol}-dca-x.png`;a.click();}}
            style={{width:"100%",padding:"13px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:800,border:"2px solid #4ADE80",background:"rgba(74,222,128,0.1)",color:"#4ADE80"}}>
            ⬇ Download — Ready for X, Instagram & Telegram
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [assets,setAssets]   = useState([]);
  const [loading,setLoading] = useState(true);
  const [err,setErr]         = useState(null);
  const [loadingProgress,setLoadingProgress] = useState(0);

  const [search,setSearch]   = useState("");
  const [dropOpen,setDropOpen] = useState(false);
  const [selected,setSelected] = useState(null);
  const [livePrice,setLivePrice] = useState(null);
  const [loadingLive,setLoadingLive] = useState(false);
  const [history,setHistory] = useState(null);
  const [analysis,setAnalysis] = useState(null);
  const [loadingHist,setLoadingHist] = useState(false);

  const [capital,setCapital]   = useState(500);
  const [capitalDisplay,setCapitalDisplay] = useState("500");
  const [freqId,setFreqId]     = useState("daily");
  const [months,setMonths]     = useState(3);
  const [targetPct,setTargetPct] = useState(50);

  const [simState,setSimState] = useState("idle"); // idle | running | done
  const [sim,setSim]           = useState(null);
  const [simMsg,setSimMsg]     = useState("");

  // sticky bar ref for smooth scroll
  const shareRef = useRef(null);
  const timerRef = useRef(null);

  const freq    = FREQS.find(f=>f.id===freqId);
  const maxMo   = freq.maxMonths;
  const safeMo  = Math.min(months, maxMo);

  // ── Load top 250 ──
  useEffect(()=>{
    setLoadingProgress(10);
    const t1=setTimeout(()=>setLoadingProgress(40),400);
    const t2=setTimeout(()=>setLoadingProgress(75),900);
    getCoins()
      .then(d=>{ setAssets(d); setLoadingProgress(100); })
      .catch(e=>setErr(e.message))
      .finally(()=>{ setLoading(false); clearTimeout(t1); clearTimeout(t2); });
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[]);

  useEffect(()=>{ if(months>maxMo) setMonths(maxMo); },[freqId]);

  // ── Live price polling ──
  const pollLive = useCallback(async id=>{
    setLoadingLive(true);
    const lp=await getLivePrice(id);
    if(lp) setLivePrice(lp);
    setLoadingLive(false);
  },[]);

  useEffect(()=>{
    if(!selected) return;
    clearInterval(timerRef.current);
    setLivePrice(null); setHistory(null); setAnalysis(null);
    setSim(null); setSimState("idle");
    pollLive(selected.id);
    timerRef.current = setInterval(()=>pollLive(selected.id), 30000);
    setLoadingHist(true);
    getHistory(selected.id)
      .then(d=>{ setHistory(d); setAnalysis(analyzeMarket(d.prices)); })
      .catch(()=>{})
      .finally(()=>setLoadingHist(false));
    return ()=>clearInterval(timerRef.current);
  },[selected]);

  // ── Simulate ──
  const handleSim = async () => {
    if (!history||!selected) return;
    setSimState("running"); setSim(null);
    const msgs=["Fetching live price…","Analysing 120 days of data…","Calculating your entries…","Almost there…"];
    let i=0; setSimMsg(msgs[0]);
    const iv=setInterval(()=>{ i=(i+1)%msgs.length; setSimMsg(msgs[i]); },700);
    const lp=await getLivePrice(selected.id);
    if(lp) setLivePrice(lp);
    await new Promise(r=>setTimeout(r,1600));
    clearInterval(iv);
    setSim(runSim({ capital:Number(capital)||500, freqId, months:safeMo, targetPct, prices:history.prices, livePrice:lp?.price }));
    setSimState("done");
  };

  // ── Scroll to share panel ──
  const scrollToShare = () => {
    shareRef.current?.scrollIntoView({ behavior:"smooth", block:"start" });
  };

  const filtered = assets.filter(a=>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const showSticky = simState==="done" && sim;

  return (
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"'Inter','Segoe UI',sans-serif",color:G.text,paddingBottom:showSticky?90:40}}>

      {/* ── STICKY BOTTOM BAR ── */}
      {showSticky && (
        <div style={{
          position:"fixed",bottom:0,left:0,right:0,zIndex:100,
          background:"rgba(255,255,255,0.97)",
          borderTop:`2px solid ${G.greenBorder}`,
          backdropFilter:"blur(8px)",
          padding:"10px 16px",
          display:"flex",gap:10,alignItems:"center",
          boxShadow:"0 -4px 24px rgba(22,163,74,0.12)",
        }}>
          <button onClick={scrollToShare} style={{
            flex:2,padding:"13px",borderRadius:12,cursor:"pointer",
            fontFamily:"inherit",fontSize:15,fontWeight:900,border:"none",
            background:G.green,color:"#fff",
            boxShadow:"0 4px 16px rgba(22,163,74,0.35)",
          }}>
            🔥 Share Your Card
          </button>
          <button onClick={handleSim} disabled={simState==="running"} style={{
            flex:1,padding:"13px",borderRadius:12,cursor:"pointer",
            fontFamily:"inherit",fontSize:14,fontWeight:700,
            border:`2px solid ${G.greenBorder}`,
            background:G.greenPale,color:G.green,
          }}>
            Recalculate ↻
          </button>
        </div>
      )}

      {/* ── NAV ── */}
      <nav style={{background:G.surface,borderBottom:`1px solid ${G.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:62,position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 8px rgba(22,163,74,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:G.green,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>CM</div>
          <span style={{fontWeight:800,fontSize:17,color:G.green}}>CMVNG</span>
          <span style={{fontWeight:400,fontSize:14,color:G.muted}}> DCA Simulator</span>
        </div>
        <div style={{background:G.greenPale,color:G.green,border:`1px solid ${G.greenBorder}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
          <Dot/>Live · Top 250
        </div>
      </nav>

      <main style={{maxWidth:680,margin:"0 auto",padding:"28px 16px"}}>

        {/* HERO */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <h1 style={{fontSize:"clamp(24px,4.5vw,40px)",fontWeight:900,color:G.dark,margin:0,lineHeight:1.15}}>
            How much could you make<br/><span style={{color:G.green}}>DCA-ing into crypto?</span>
          </h1>
          <p style={{color:G.muted,fontSize:15,marginTop:10,marginBottom:0}}>Pick a coin · Set your plan · Get real numbers · Share your strategy</p>
        </div>

        {/* ── STEP 1 — COIN ── */}
        <div style={card}>
          <div style={secLabel}><span style={stepNum}>1</span>Choose Your Coin</div>

          {loading ? (
            <div>
              <div style={{fontSize:13,color:G.muted,marginBottom:8}}>Loading top 250 coins…</div>
              <div style={{height:4,background:G.border,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",background:G.green,borderRadius:4,width:`${loadingProgress}%`,transition:"width 0.4s ease"}}/>
              </div>
            </div>
          ) : err ? (
            <div style={{color:G.red,fontSize:14}}>{err}</div>
          ) : (
            <div style={{position:"relative"}}>
              <input
                style={{...inp, paddingLeft:selected?48:14}}
                value={selected?`${selected.name} (${selected.symbol.toUpperCase()})`:search}
                onChange={e=>{ setSearch(e.target.value); if(selected) setSelected(null); setDropOpen(true); }}
                onFocus={e=>{ e.target.style.borderColor=G.green; setDropOpen(true); }}
                onBlur={e=>{ e.target.style.borderColor=G.border; setTimeout(()=>setDropOpen(false),180); }}
                placeholder="Search Bitcoin, Ethereum, Solana… (250 coins)"
              />
              {selected && (
                <div style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)"}}>
                  <CoinImg src={selected.image} symbol={selected.symbol} size={24}/>
                </div>
              )}

              {dropOpen && !selected && (
                <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:200,background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,maxHeight:300,overflowY:"auto",boxShadow:"0 8px 30px rgba(0,0,0,0.1)"}}>
                  {filtered.slice(0,40).map((a,idx)=>(
                    <div key={a.id}
                      onMouseDown={()=>{ setSelected(a); setSearch(""); setDropOpen(false); }}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",borderBottom:idx<39?`1px solid ${G.border}`:"none"}}
                      onMouseEnter={e=>e.currentTarget.style.background=G.surfaceAlt}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    >
                      <CoinImg src={a.image} symbol={a.symbol} size={30}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:G.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                        <div style={{fontSize:12,color:G.muted}}>{a.symbol.toUpperCase()} · #{a.market_cap_rank}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:G.dark}}>{fmtPrice(a.current_price)}</div>
                        <div style={{fontSize:11,color:(a.price_change_percentage_24h||0)>=0?G.green:G.red}}>{fmtPct(a.price_change_percentage_24h||0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selected && (
            <div style={{marginTop:14,padding:14,background:G.surfaceAlt,borderRadius:12,border:`1px solid ${G.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <CoinImg src={selected.image} symbol={selected.symbol} size={36}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{selected.name} <span style={{color:G.muted,fontWeight:400,fontSize:12}}>#{selected.market_cap_rank}</span></div>
                  {loadingLive
                    ? <div style={{fontSize:12,color:G.muted}}>Getting live price…</div>
                    : livePrice
                      ? <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,flexWrap:"wrap"}}>
                          <span style={{fontWeight:800,fontSize:18,color:G.dark}}>{fmtPrice(livePrice.price)}</span>
                          <span style={{background:livePrice.change24h>=0?G.greenPale:G.redPale,color:livePrice.change24h>=0?G.green:G.red,border:`1px solid ${livePrice.change24h>=0?G.greenBorder:G.redBorder}`,borderRadius:20,padding:"2px 10px",fontSize:13,fontWeight:700}}>{fmtPct(livePrice.change24h)}</span>
                          <span style={{fontSize:11,color:G.muted}}>· live</span>
                        </div>
                      : <div style={{fontSize:14,fontWeight:700}}>{fmtPrice(selected.current_price)}</div>
                  }
                </div>
                {analysis && <TrendPill trend={analysis.trend}/>}
              </div>
              {loadingHist && <div style={{marginTop:8,fontSize:12,color:G.muted}}>Analysing 120-day price history…</div>}
              {analysis && (
                <div style={{marginTop:10,background:analysis.verdictBg,border:`1.5px solid ${analysis.verdictColor}40`,borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:16,flexShrink:0}}>
                    {analysis.score>=3?"🔥":analysis.score>=1?"✅":analysis.score>=-1?"⚠️":"❌"}
                  </span>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:analysis.verdictColor}}>{analysis.verdict}</div>
                    <div style={{fontSize:13,color:G.muted,marginTop:2}}>{analysis.verdictDesc}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── STEP 2 — STRATEGY ── */}
        <div style={card}>
          <div style={secLabel}><span style={stepNum}>2</span>Build Your Plan</div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:6}}>Total money to invest (USD)</label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16,fontWeight:700,color:G.sub,pointerEvents:"none"}}>$</span>
              <input
                type="text"
                inputMode="numeric"
                style={{...inp, paddingLeft:28}}
                value={capitalDisplay}
                onChange={e=>{
                  const raw=e.target.value.replace(/[^0-9]/g,"");
                  const num=Math.max(1,Number(raw)||1);
                  setCapital(num);
                  setCapitalDisplay(raw===""?"":Number(raw).toLocaleString("en-US"));
                }}
                onFocus={e=>{ e.target.style.borderColor=G.green; setCapitalDisplay(String(capital)); }}
                onBlur={e=>{ e.target.style.borderColor=G.border; setCapitalDisplay(capital.toLocaleString("en-US")); }}
                placeholder="e.g. 1,000"
              />
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:8}}>How often do you buy?</label>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {FREQS.map(f=>(
                <button key={f.id} onClick={()=>setFreqId(f.id)} style={{flex:1,padding:"10px 4px",borderRadius:11,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,border:`2px solid ${freqId===f.id?G.green:G.border}`,background:freqId===f.id?G.green:G.surfaceAlt,color:freqId===f.id?"#fff":G.muted,transition:"all 0.15s"}}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{fontSize:12,color:G.muted,marginTop:6}}>
              All frequencies support up to 6 months · Each buy: <strong>{fmtUSD(Number(capital)/Math.max(4,Math.round((safeMo*30)/freq.days)))}</strong>
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:8}}>
              Over how long? <span style={{color:G.green,fontWeight:900}}>{safeMo} month{safeMo!==1?"s":""}</span>
            </label>
            <input type="range" min={1} max={maxMo} value={safeMo} step={1}
              onChange={e=>setMonths(Number(e.target.value))}
              style={{width:"100%",accentColor:G.green}}
            />
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:G.muted}}>
              <span>1 month</span><span>{maxMo} months</span>
            </div>
          </div>

          <div>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:8}}>What gain are you aiming for?</label>
            <div style={{display:"flex",gap:7}}>
              {TARGETS.map(t=>(
                <button key={t} onClick={()=>setTargetPct(t)} style={{flex:1,padding:"9px 0",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,border:`2px solid ${targetPct===t?G.green:G.border}`,background:targetPct===t?G.greenPale:G.surfaceAlt,color:targetPct===t?G.green:G.muted,transition:"all 0.15s"}}>
                  +{t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── SIMULATE BUTTON ── */}
        {selected && history && (
          <button onClick={handleSim} disabled={simState==="running"} style={{
            width:"100%",padding:"16px",borderRadius:14,cursor:simState==="running"?"not-allowed":"pointer",
            fontFamily:"inherit",fontSize:17,fontWeight:800,border:"none",
            background:simState==="running"?"#D1D5DB":`linear-gradient(135deg,${G.green},${G.green2})`,
            color:simState==="running"?"#9CA3AF":"#fff",
            marginBottom:14,
            boxShadow:simState==="running"?"none":"0 4px 18px rgba(22,163,74,0.32)",
            transition:"all 0.2s",
          }}>
            {simState==="running"
              ? <><Spinner/>&nbsp; {simMsg}</>
              : simState==="done"
                ? "Recalculate ↻"
                : "Show Me the Numbers →"
            }
          </button>
        )}

        {/* ── RESULTS ── */}
        {simState==="done" && sim && selected && analysis && (()=>{
          const totalInvested = sim.amtPer*sim.entries;
          const aggressive    = targetPct > analysis.volPct*2;
          const good          = analysis.score>=1;

          return (
            <>
              {/* TARGET — main result */}
              <div style={{borderRadius:18,padding:"24px",marginBottom:14,background:good?"linear-gradient(135deg,#F0FDF4,#DCFCE7)":"linear-gradient(135deg,#FEF2F2,#FFE4E6)",border:`2px solid ${good?G.greenBorder:G.redBorder}`}}>
                <div style={{fontSize:12,fontWeight:800,color:good?G.green:G.red,letterSpacing:1.5,textTransform:"uppercase"}}>
                  {good?"🎯 If your target hits":"⚠️ Reality check — if your target hits"}
                </div>
                <div style={{fontSize:13,color:G.muted,marginTop:4}}>
                  {selected.symbol.toUpperCase()} reaches {fmtPrice(sim.targetPrice)} (+{targetPct}%)
                </div>
                <div style={{fontSize:"clamp(36px,6vw,54px)",fontWeight:900,lineHeight:1.05,margin:"8px 0 4px",color:good?G.green:G.red}}>
                  {fmtUSD(sim.targetVal)}
                </div>
                <div style={{fontSize:16,fontWeight:800,color:G.dark,marginBottom:aggressive?12:0}}>
                  You profit <span style={{color:good?G.green:G.red}}>+{fmtUSD(sim.targetProfit)}</span> on {fmtUSD(totalInvested)} invested
                  <span style={{background:good?G.green:G.red,color:"#fff",borderRadius:20,padding:"2px 12px",fontSize:14,marginLeft:8}}>+{sim.targetROI.toFixed(0)}%</span>
                </div>
                {aggressive && (
                  <div style={{background:G.amberPale,border:`1px solid ${G.amberBorder}`,borderRadius:10,padding:"10px 14px",fontSize:13,color:G.amber}}>
                    ⚠️ This target is bigger than recent market moves suggest. Possible — but needs a strong rally.
                  </div>
                )}
              </div>

              {/* ── SHARE CARD CTA — RIGHT HERE, IMPOSSIBLE TO MISS ── */}
              <div ref={shareRef}>
                <SharePanel
                  selected={selected} sim={sim} targetPct={targetPct}
                  months={safeMo} freqId={freqId} analysis={analysis} livePrice={livePrice}
                />
              </div>

              {/* BREAKDOWN */}
              <div style={card}>
                <div style={secLabel}>Your DCA Breakdown</div>
                {/* Volatility window info box */}
                <div style={{background:G.surfaceAlt,borderRadius:10,padding:"10px 14px",marginBottom:14,border:`1px solid ${G.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:G.sub,marginBottom:4}}>How entries were calculated</div>
                  <div style={{fontSize:13,color:G.muted,lineHeight:1.6}}>
                    Used the last <strong style={{color:G.text}}>{sim.windowDays} days</strong> of price data ({safeMo} month{safeMo!==1?"s":""}) to model your entry prices.
                    During that window the price ranged from <strong style={{color:G.text}}>{fmtPrice(sim.simLow)}</strong> to <strong style={{color:G.text}}>{fmtPrice(sim.simHigh)}</strong> (volatility: {sim.volPct.toFixed(1)}%).
                    That range is scaled to today's live price of <strong style={{color:G.text}}>{fmtPrice(sim.refPrice)}</strong> to simulate realistic future entries.
                  </div>
                </div>
                {[
                  ["You buy",`${fmtUSD(sim.amtPer)} per purchase`],
                  ["Number of purchases",`${sim.entries} times`],
                  ["Total money in",fmtUSD(totalInvested)],
                  ["Entry price range",`${fmtPrice(sim.simLow)} – ${fmtPrice(sim.simHigh)}`],
                  ["Avg entry (vol-adjusted)",<span style={{color:sim.avgEntry<=sim.refPrice?G.green:G.amber,fontWeight:700}}>{fmtPrice(sim.avgEntry)} {sim.avgEntry<sim.refPrice?"(below live ↓)":"(above live ↑)"}</span>],
                  [`Total ${selected.symbol.toUpperCase()} accumulated`,fmtTok(sim.totalTokens)],
                  ["Value right now",<span style={{color:sim.currentROI>=0?G.green:G.red,fontWeight:700}}>{fmtUSD(sim.currentVal)} ({fmtPct(sim.currentROI)})</span>],
                ].map(([l,v],i,a)=>(
                  <div key={l} style={{...statRow,borderBottom:i<a.length-1?`1px solid ${G.border}`:"none"}}>
                    <span style={{fontSize:14,color:G.muted}}>{l}</span>
                    <span style={{fontSize:14,fontWeight:700,color:G.text}}>{v}</span>
                  </div>
                ))}
              </div>

              {/* SCENARIOS */}
              <div style={card}>
                <div style={secLabel}>What if the price moves differently?</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {label:"Price stays flat",plain:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.flatVal)} back — zero gain`,roi:"±0%",c:G.amber,bg:G.amberPale,b:G.amberBorder},
                    {label:`Drops 20% → ${fmtPrice(sim.avgEntry*0.8)}`,plain:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.downVal)} back — down ${fmtUSD(Math.abs(sim.downLoss))}`,roi:"-20%",c:G.red,bg:G.redPale,b:G.redBorder},
                    {label:`Crashes 50% → ${fmtPrice(sim.avgEntry*0.5)}`,plain:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.down50Val)} back — down ${fmtUSD(Math.abs(sim.down50Loss))}`,roi:"-50%",c:"#9F1239",bg:"#FFF1F2",b:"#FDA4AF"},
                  ].map(sc=>(
                    <div key={sc.label} style={{background:sc.bg,border:`1.5px solid ${sc.b}`,borderRadius:14,padding:"14px 18px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{fontSize:13,fontWeight:700,color:sc.c}}>{sc.label}</div>
                        <span style={{fontWeight:800,fontSize:14,color:sc.c,flexShrink:0,marginLeft:8}}>{sc.roi}</span>
                      </div>
                      <div style={{fontSize:14,color:G.text,marginTop:5}}>{sc.plain}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MARKET SNAPSHOT */}
              <div style={card}>
                <div style={secLabel}>Market Snapshot · 120 Days</div>
                {[
                  ["Current live price",fmtPrice(sim.refPrice)],
                  ["30-day average",fmtPrice(analysis.ma30)],
                  ["90-day average",fmtPrice(analysis.ma90)],
                  ["Price volatility",`${analysis.volPct.toFixed(1)}%`],
                  ["120-day momentum",<PctBadge val={analysis.momentum}/>],
                  ["Trend",<TrendPill trend={analysis.trend}/>],
                ].map(([l,v],i,a)=>(
                  <div key={l} style={{...statRow,borderBottom:i<a.length-1?`1px solid ${G.border}`:"none"}}>
                    <span style={{fontSize:14,color:G.muted}}>{l}</span>
                    <span style={{fontSize:14,fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        <div style={{textAlign:"center",fontSize:12,color:G.muted,marginTop:16,paddingBottom:8}}>
          CMVNG DCA Simulator · Not financial advice · DYOR · Data via CoinGecko
        </div>
      </main>
    </div>
  );
}
