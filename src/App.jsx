import { useState, useEffect, useRef, useCallback } from "react";

const STABLE = new Set([
  "tether","usd-coin","binance-usd","dai","true-usd","frax","usdp","neutrino",
  "gemini-dollar","liquity-usd","fei-usd","usdd","celo-dollar","terraclassicusd",
  "paxos-standard","nusd","flex-usd","usdk","husd","usdx","vai","susd","musd",
  "dola-usd","origin-dollar","usdn","sperax-usd","paypal-usd","first-digital-usd",
  "usde","ethena-usde","usdy","mountain-protocol-usdm","ondo-us-dollar-yield",
  "stasis-eurs","ageur","eurc","euro-coin","tether-eurt","steur",
  "wrapped-bitcoin","wrapped-ethereum","staked-ether","rocket-pool-eth",
  "lido-staked-ether","coinbase-wrapped-staked-eth","mantle-staked-ether",
  "stakewise-v3-oseth","frax-ether","stakehound-staked-ether",
]);

const FREQS = [
  { id: "12h",      label: "Every 12h",  days: 0.5, maxMonths: 2 },
  { id: "daily",    label: "Daily",      days: 1,   maxMonths: 4 },
  { id: "weekly",   label: "Weekly",     days: 7,   maxMonths: 6 },
  { id: "biweekly", label: "Bi-weekly",  days: 14,  maxMonths: 6 },
];

const TARGETS = [10, 25, 50, 100, 200];
const CG = "https://api.coingecko.com/api/v3";
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

const cache = {
  get(k, ttl=CACHE_TTL){try{const r=localStorage.getItem("cmv_"+k);if(!r)return null;const{d,t}=JSON.parse(r);return Date.now()-t<ttl?d:null;}catch{return null;}},
  set(k,d){try{localStorage.setItem("cmv_"+k,JSON.stringify({d,t:Date.now()}));}catch{}},
  stale(k){try{const r=localStorage.getItem("cmv_"+k);return r?JSON.parse(r).d:null;}catch{return null;}},
};

async function getTop100(){
  const hit=cache.get("top100");if(hit)return hit;
  try{
    const [p1,p2]=await Promise.all([
      fetch(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1`).then(r=>r.json()),
      fetch(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=2`).then(r=>r.json()),
    ]);
    const top=([...p1,...p2]).filter(a=>!STABLE.has(a.id)).slice(0,100);
    cache.set("top100",top);return top;
  }catch{const s=cache.stale("top100");if(s)return s;throw new Error("Could not load coins.");}
}

async function getLivePrice(id){
  const hit=cache.get("lp_"+id,PRICE_TTL);if(hit)return hit;
  try{
    const r=await fetch(`${CG}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
    const d=await r.json();if(!d[id])return null;
    const result={price:d[id].usd,change24h:d[id].usd_24h_change||0};
    cache.set("lp_"+id,result);return result;
  }catch{return null;}
}

async function getHistory(id){
  const hit=cache.get("h_"+id);if(hit)return hit;
  try{
    const r=await fetch(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=120`);
    if(!r.ok)throw new Error();const d=await r.json();cache.set("h_"+id,d);return d;
  }catch{const s=cache.stale("h_"+id);if(s)return s;throw new Error("Could not load history.");}
}

const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const std=a=>{const m=avg(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);};

function analyzeMarket(prices){
  const vals=prices.map(p=>p[1]);
  const ma30=avg(vals.slice(-30)),ma90=avg(vals.slice(-90));
  const vol30=std(vals.slice(-30)),cur=vals[vals.length-1],oldest=vals[0];
  const volPct=(vol30/cur)*100;
  const momentum=((cur-oldest)/oldest)*100;
  const mn=Math.min(...vals),mx=Math.max(...vals);
  const nearLow=(cur-mn)/(mx-mn||1);
  let trend="Ranging";
  if(cur>ma30*1.02&&ma30>ma90)trend="Uptrend";
  else if(cur<ma30*0.98&&ma30<ma90)trend="Downtrend";
  const score=(trend==="Uptrend"?2:trend==="Downtrend"?-2:0)+(momentum>20?2:momentum>0?1:momentum>-20?-1:-2)+(nearLow<0.35?1:nearLow>0.75?-1:0);
  let verdict,verdictColor,verdictBg,verdictDesc;
  if(score>=3){verdict="Strong Setup";verdictColor=G.green;verdictBg=G.greenPale;verdictDesc="Price action looks solid. Trend and momentum are on your side.";}
  else if(score>=1){verdict="Decent Setup";verdictColor=G.blue;verdictBg=G.bluePale;verdictDesc="Conditions are okay. DCA helps reduce your timing risk here.";}
  else if(score>=-1){verdict="Mixed Signals";verdictColor=G.amber;verdictBg=G.amberPale;verdictDesc="Market is uncertain. Keep position sizes smaller than usual.";}
  else{verdict="Weak Setup";verdictColor=G.red;verdictBg=G.redPale;verdictDesc="Price action is poor. Expect a tough road to profit if you enter here.";}
  return{ma30,ma90,vol30,volPct,cur,trend,momentum,nearLow,verdict,verdictColor,verdictBg,verdictDesc,score};
}

function smooth(prices,w=3){return prices.map((_,i)=>avg(prices.slice(Math.max(0,i-w+1),i+1).map(x=>x[1])));}

function runSim({capital,freqId,months,targetPct,prices,livePrice}){
  const freq=FREQS.find(f=>f.id===freqId);
  const totalDays=months*30;
  const entries=Math.min(120,Math.max(4,Math.round(totalDays/freq.days)));
  const amtPer=capital/entries;
  const sm=smooth(prices);
  const step=Math.max(1,Math.floor(sm.length/entries));
  const entryPrices=Array.from({length:entries},(_,i)=>sm[Math.min(i*step,sm.length-1)]);
  const totalTokens=entryPrices.reduce((s,p)=>s+amtPer/p,0);
  const avgEntry=capital/totalTokens;
  const refPrice=livePrice||prices[prices.length-1][1];
  const targetPrice=avgEntry*(1+targetPct/100);
  const targetVal=totalTokens*targetPrice;
  const currentVal=totalTokens*refPrice;
  const downVal=totalTokens*(avgEntry*0.8);
  const down50Val=totalTokens*(avgEntry*0.5);
  return{
    entries,amtPer,avgEntry,totalTokens,refPrice,
    targetPrice,targetVal,targetProfit:targetVal-capital,targetROI:((targetVal-capital)/capital)*100,
    currentVal,currentROI:((currentVal-capital)/capital)*100,
    flatVal:capital,
    downVal,downLoss:downVal-capital,
    down50Val,down50Loss:down50Val-capital,
  };
}

const fmtUSD=n=>{const a=Math.abs(n),s=n<0?"-":"";return a>=1e6?`${s}$${(a/1e6).toFixed(2)}M`:a>=1e3?`${s}$${(a/1e3).toFixed(1)}K`:`${s}$${a.toFixed(2)}`;};
const fmtPrice=n=>n>=1000?`$${n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:n>=1?`$${n.toFixed(2)}`:`$${n.toPrecision(4)}`;
const fmtPct=n=>`${n>=0?"+":""}${n.toFixed(1)}%`;
const fmtTok=n=>n<0.001?n.toFixed(8):n<1?n.toFixed(4):n<1000?n.toFixed(3):n.toFixed(1);

function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function loadImg(src){return new Promise(res=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;});}

async function makeCard({asset,sim,targetPct,months,freqId,userName,profileImg,analysis,livePrice}){
  const W=1080,H=1920,cv=document.createElement("canvas");
  cv.width=W;cv.height=H;const ctx=cv.getContext("2d");
  const freq=FREQS.find(f=>f.id===freqId);
  const good=analysis.score>=1;
  const totalInvested=sim.amtPer*sim.entries;

  // BG
  ctx.fillStyle="#F7FDF9";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="rgba(187,247,208,0.35)";ctx.beginPath();ctx.arc(W+60,80,300,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="rgba(187,247,208,0.2)";ctx.beginPath();ctx.arc(-60,H-160,260,0,Math.PI*2);ctx.fill();

  // TOP BAR
  ctx.fillStyle="#16A34A";ctx.fillRect(0,0,W,118);
  ctx.fillStyle="#FFFFFF";ctx.font="bold 40px Arial";ctx.textAlign="left";ctx.fillText("CMVNG",52,68);
  ctx.fillStyle="rgba(255,255,255,0.65)";ctx.font="24px Arial";ctx.fillText("DCA Simulator",52,100);

  if(profileImg){const img=await loadImg(profileImg);if(img){ctx.save();ctx.beginPath();ctx.arc(W-90,58,48,0,Math.PI*2);ctx.clip();ctx.drawImage(img,W-138,10,96,96);ctx.restore();ctx.strokeStyle="#FFFFFF";ctx.lineWidth=3;ctx.beginPath();ctx.arc(W-90,58,48,0,Math.PI*2);ctx.stroke();}}
  if(userName){ctx.fillStyle="#FFFFFF";ctx.font="bold 26px Arial";ctx.textAlign="right";ctx.fillText(userName,profileImg?W-156:W-52,62);}

  let y=138;

  // ASSET ROW
  rr(ctx,40,y,W-80,160,20);ctx.fillStyle="#FFFFFF";ctx.fill();ctx.strokeStyle="#BBF7D0";ctx.lineWidth=2;ctx.stroke();
  if(asset.image){const logo=await loadImg(asset.image);if(logo){ctx.save();ctx.beginPath();ctx.arc(114,y+80,48,0,Math.PI*2);ctx.clip();ctx.drawImage(logo,66,y+32,96,96);ctx.restore();}}
  ctx.fillStyle="#052E16";ctx.font="bold 64px Arial";ctx.textAlign="left";ctx.fillText(asset.symbol.toUpperCase(),188,y+88);
  ctx.fillStyle="#6B7280";ctx.font="26px Arial";ctx.fillText(asset.name,188,y+128);
  const lp=livePrice?.price||asset.current_price;
  ctx.fillStyle="#16A34A";ctx.font="bold 32px Arial";ctx.textAlign="right";ctx.fillText(fmtPrice(lp),W-52,y+82);
  if(livePrice?.change24h!==undefined){const c=livePrice.change24h;ctx.fillStyle=c>=0?"#16A34A":"#DC2626";ctx.font="24px Arial";ctx.fillText(`${fmtPct(c)} 24h`,W-52,y+122);}

  y+=186;

  // VERDICT
  const vc=analysis.verdictColor;
  rr(ctx,40,y,W-80,112,18);ctx.fillStyle=analysis.verdictBg;ctx.fill();ctx.strokeStyle=vc+"80";ctx.lineWidth=2;ctx.stroke();
  const icon=analysis.score>=3?"🔥":analysis.score>=1?"✅":analysis.score>=-1?"⚠️":"❌";
  ctx.font="36px Arial";ctx.textAlign="left";ctx.fillText(icon,58,y+58);
  ctx.fillStyle=vc;ctx.font="bold 30px Arial";ctx.fillText(`SETUP: ${analysis.verdict.toUpperCase()}`,112,y+48);
  ctx.fillStyle="#374151";ctx.font="22px Arial";
  const desc=analysis.verdictDesc;ctx.fillText(desc.length>72?desc.slice(0,72)+"…":desc,112,y+84);

  y+=138;

  // STRATEGY BANNER
  const sg=ctx.createLinearGradient(40,y,W-40,y+190);sg.addColorStop(0,"#16A34A");sg.addColorStop(1,"#14532D");
  rr(ctx,40,y,W-80,190,20);ctx.fillStyle=sg;ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.08)";ctx.beginPath();ctx.arc(W-80,y+95,150,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.7)";ctx.font="24px Arial";ctx.textAlign="left";ctx.fillText("MY DCA PLAN",58,y+40);
  ctx.fillStyle="#FFFFFF";ctx.font="bold 44px Arial";
  const mainLine=`${fmtUSD(sim.amtPer)} ${freq.label.toLowerCase()} into ${asset.symbol.toUpperCase()}`;
  ctx.fillText(mainLine.length>38?mainLine.slice(0,38)+"…":mainLine,58,y+96);
  ctx.fillStyle="rgba(255,255,255,0.8)";ctx.font="26px Arial";
  ctx.fillText(`${months} month${months>1?"s":""}  ·  ${sim.entries} purchases  ·  ${fmtUSD(totalInvested)} total in`,58,y+144);
  ctx.fillStyle="rgba(255,255,255,0.55)";ctx.font="22px Arial";
  ctx.fillText(`Avg buy price: ${fmtPrice(sim.avgEntry)}  ·  ${fmtTok(sim.totalTokens)} ${asset.symbol.toUpperCase()} total`,58,y+180);

  y+=216;

  // MAIN RESULT
  rr(ctx,40,y,W-80,250,20);
  ctx.fillStyle=good?"#F0FDF4":"#FEF2F2";ctx.fill();
  ctx.strokeStyle=good?"#4ADE80":"#FCA5A5";ctx.lineWidth=3;ctx.stroke();
  ctx.textAlign="left";
  ctx.fillStyle=good?"#16A34A":"#DC2626";ctx.font="bold 28px Arial";
  ctx.fillText(`IF ${asset.symbol.toUpperCase()} REACHES ${fmtPrice(sim.targetPrice)} (+${targetPct}%)`,58,y+46);
  ctx.fillStyle="#052E16";ctx.font="bold 100px Arial";ctx.fillText(fmtUSD(sim.targetVal),58,y+160);
  ctx.fillStyle=good?"#16A34A":"#DC2626";ctx.font="bold 38px Arial";
  ctx.fillText(`You profit: +${fmtUSD(sim.targetProfit)}`,58,y+212);
  rr(ctx,W-230,y+18,182,66,33);ctx.fillStyle=good?"#16A34A":"#DC2626";ctx.fill();
  ctx.fillStyle="#FFFFFF";ctx.font="bold 38px Arial";ctx.textAlign="center";ctx.fillText(`+${targetPct}%`,W-139,y+62);

  y+=276;

  // SCENARIOS
  ctx.fillStyle="#374151";ctx.font="bold 26px Arial";ctx.textAlign="left";
  ctx.fillText("WHAT ELSE COULD HAPPEN?",40,y+4);y+=34;

  const scs=[
    {label:"Price stays flat",detail:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.flatVal)} out`,sub:"break even",color:G.amber,bg:G.amberPale,brd:G.amberBorder},
    {label:`Price drops 20% → ${fmtPrice(sim.avgEntry*0.8)}`,detail:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.downVal)} out`,sub:`−${fmtUSD(Math.abs(sim.downLoss))}`,color:"#EF4444",bg:"#FEF2F2",brd:"#FECACA"},
    {label:`Price crashes 50% → ${fmtPrice(sim.avgEntry*0.5)}`,detail:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.down50Val)} out`,sub:`−${fmtUSD(Math.abs(sim.down50Loss))}`,color:"#9F1239",bg:"#FFF1F2",brd:"#FDA4AF"},
  ];
  for(const sc of scs){
    rr(ctx,40,y,W-80,126,16);ctx.fillStyle=sc.bg;ctx.fill();ctx.strokeStyle=sc.brd;ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle=sc.color;ctx.font="bold 24px Arial";ctx.textAlign="left";ctx.fillText(sc.label,58,y+38);
    ctx.fillStyle="#374151";ctx.font="26px Arial";ctx.fillText(sc.detail,58,y+76);
    ctx.fillStyle=sc.color;ctx.font="bold 28px Arial";ctx.textAlign="right";ctx.fillText(sc.sub,W-58,y+76);
    y+=144;
  }

  // CURRENT VALUE
  rr(ctx,40,y,W-80,100,16);ctx.fillStyle="#F8FAFC";ctx.fill();ctx.strokeStyle=G.border;ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle="#6B7280";ctx.font="22px Arial";ctx.textAlign="left";ctx.fillText(`AT TODAY'S LIVE PRICE (${fmtPrice(sim.refPrice)})`,58,y+36);
  const curPnl=sim.currentVal-totalInvested;
  ctx.fillStyle=curPnl>=0?"#16A34A":"#DC2626";ctx.font="bold 36px Arial";
  ctx.fillText(`${fmtUSD(sim.currentVal)}  (${fmtPct(sim.currentROI)})`,58,y+80);

  y+=120;

  ctx.fillStyle="#9CA3AF";ctx.font="20px Arial";ctx.textAlign="center";
  ctx.fillText("Not financial advice. DYOR. Past data ≠ future results.",W/2,y+20);

  const fy=H-128;ctx.fillStyle="#16A34A";ctx.fillRect(0,fy,W,128);
  ctx.fillStyle="#FFFFFF";ctx.font="bold 44px Arial";ctx.textAlign="center";ctx.fillText("CMVNG DCA SIMULATOR",W/2,fy+56);
  ctx.fillStyle="rgba(255,255,255,0.65)";ctx.font="24px Arial";
  ctx.fillText(`cmvng.app  ·  #CMVNG  ·  #DCA  ·  #${asset.symbol.toUpperCase()}  ·  #Crypto`,W/2,fy+100);

  return cv.toDataURL("image/png");
}

// ── SMALL UI BITS ──────────────────────────────────────────────────────────────
function Dot(){return<span style={{width:8,height:8,borderRadius:"50%",background:G.green,display:"inline-block",animation:"pulse 1.2s infinite"}}><style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style></span>;}
function Spinner(){return<span style={{display:"inline-flex",gap:5,alignItems:"center"}}>{[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:"50%",background:"#fff",display:"inline-block",animation:`bop 0.7s ${i*0.15}s infinite alternate`}}/>)}<style>{`@keyframes bop{from{transform:translateY(0)}to{transform:translateY(-5px)}}`}</style></span>;}
function TrendPill({trend}){const map={Uptrend:[G.green,G.greenPale,G.greenBorder],Downtrend:[G.red,G.redPale,G.redBorder],Ranging:[G.amber,G.amberPale,G.amberBorder]};const[c,bg,b]=map[trend]||map.Ranging;return<span style={{background:bg,color:c,border:`1px solid ${b}`,borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700}}>{trend}</span>;}
function PctBadge({val}){const up=val>=0;return<span style={{background:up?G.greenPale:G.redPale,color:up?G.green:G.red,border:`1px solid ${up?G.greenBorder:G.redBorder}`,borderRadius:20,padding:"2px 10px",fontSize:13,fontWeight:700}}>{fmtPct(val)}</span>;}

const inp={width:"100%",boxSizing:"border-box",border:`1.5px solid ${G.border}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"inherit",color:G.text,background:G.surfaceAlt,outline:"none",transition:"border-color 0.15s"};
const card={background:G.surface,border:`1px solid ${G.border}`,borderRadius:18,padding:"22px",marginBottom:14,boxShadow:"0 1px 4px rgba(22,163,74,0.05)"};
const secLabel={fontSize:12,fontWeight:800,color:G.green,letterSpacing:2,textTransform:"uppercase",marginBottom:14,display:"flex",alignItems:"center",gap:7};
const stepNum={width:20,height:20,borderRadius:"50%",background:G.green,color:"#fff",fontSize:11,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0};
const statRow={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${G.border}`};

export default function App(){
  const[assets,setAssets]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState(null);
  const[search,setSearch]=useState("");
  const[dropOpen,setDropOpen]=useState(false);
  const[selected,setSelected]=useState(null);
  const[livePrice,setLivePrice]=useState(null);
  const[loadingLive,setLoadingLive]=useState(false);
  const[history,setHistory]=useState(null);
  const[analysis,setAnalysis]=useState(null);
  const[loadingHist,setLoadingHist]=useState(false);
  const[capital,setCapital]=useState(500);
  const[freqId,setFreqId]=useState("daily");
  const[months,setMonths]=useState(3);
  const[targetPct,setTargetPct]=useState(50);
  const[userName,setUserName]=useState("");
  const[profileImg,setProfileImg]=useState(null);
  const[simState,setSimState]=useState("idle");
  const[sim,setSim]=useState(null);
  const[simMsg,setSimMsg]=useState("");
  const[cardUrl,setCardUrl]=useState(null);
  const[genCard,setGenCard]=useState(false);
  const timerRef=useRef(null);
  const freq=FREQS.find(f=>f.id===freqId);
  const maxMo=freq.maxMonths;
  const safeMo=Math.min(months,maxMo);

  useEffect(()=>{getTop100().then(setAssets).catch(e=>setErr(e.message)).finally(()=>setLoading(false));},[]);
  useEffect(()=>{if(months>maxMo)setMonths(maxMo);},[freqId]);

  const pollLive=useCallback(async id=>{setLoadingLive(true);const lp=await getLivePrice(id);if(lp)setLivePrice(lp);setLoadingLive(false);},[]);

  useEffect(()=>{
    if(!selected)return;
    clearInterval(timerRef.current);
    setLivePrice(null);setHistory(null);setAnalysis(null);setSim(null);setSimState("idle");setCardUrl(null);
    pollLive(selected.id);timerRef.current=setInterval(()=>pollLive(selected.id),30000);
    setLoadingHist(true);
    getHistory(selected.id).then(d=>{setHistory(d);setAnalysis(analyzeMarket(d.prices));}).catch(()=>{}).finally(()=>setLoadingHist(false));
    return()=>clearInterval(timerRef.current);
  },[selected]);

  const handleSim=async()=>{
    if(!history||!selected)return;
    setSimState("running");setSim(null);setCardUrl(null);
    const msgs=["Fetching live price…","Analysing 120 days of data…","Calculating your entries…","Crunching the numbers…"];
    let i=0;setSimMsg(msgs[0]);
    const iv=setInterval(()=>{i=(i+1)%msgs.length;setSimMsg(msgs[i]);},600);
    const lp=await getLivePrice(selected.id);if(lp)setLivePrice(lp);
    await new Promise(r=>setTimeout(r,1800));clearInterval(iv);
    setSim(runSim({capital:Number(capital)||500,freqId,months:safeMo,targetPct,prices:history.prices,livePrice:lp?.price}));
    setSimState("done");
  };

  const handleCard=async()=>{
    if(!sim||!selected||!analysis)return;
    setGenCard(true);
    try{const url=await makeCard({asset:selected,sim,targetPct,months:safeMo,freqId,userName:userName.trim(),profileImg,analysis,livePrice});setCardUrl(url);}
    catch(e){console.error(e);}
    setGenCard(false);
  };

  const filtered=assets.filter(a=>a.name.toLowerCase().includes(search.toLowerCase())||a.symbol.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"'Inter','Segoe UI',sans-serif",color:G.text,paddingBottom:60}}>
      {/* NAV */}
      <nav style={{background:G.surface,borderBottom:`1px solid ${G.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:62,position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 8px rgba(22,163,74,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:G.green,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>CM</div>
          <span style={{fontWeight:800,fontSize:17,color:G.green}}>CMVNG</span>
          <span style={{fontWeight:400,fontSize:14,color:G.muted}}> DCA Simulator</span>
        </div>
        <div style={{background:G.greenPale,color:G.green,border:`1px solid ${G.greenBorder}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5}}><Dot/>Live Data</div>
      </nav>

      <main style={{maxWidth:680,margin:"0 auto",padding:"28px 16px"}}>
        {/* HERO */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <h1 style={{fontSize:"clamp(24px,4.5vw,40px)",fontWeight:900,color:G.dark,margin:0,lineHeight:1.15}}>
            How much could you make<br/><span style={{color:G.green}}>DCA-ing into crypto?</span>
          </h1>
          <p style={{color:G.muted,fontSize:15,marginTop:10,marginBottom:0}}>Pick a coin, set your plan, get real numbers — plain English.</p>
        </div>

        {/* STEP 1 */}
        <div style={card}>
          <div style={secLabel}><span style={stepNum}>1</span>Choose Your Coin</div>
          {loading?<div style={{color:G.muted,fontSize:14}}>Loading top 100 coins…</div>
          :err?<div style={{color:G.red,fontSize:14}}>{err}</div>
          :<div style={{position:"relative"}}>
            <input style={{...inp,paddingLeft:selected?48:14}}
              value={selected?`${selected.name} (${selected.symbol.toUpperCase()})`:search}
              onChange={e=>{setSearch(e.target.value);if(selected)setSelected(null);setDropOpen(true);}}
              onFocus={e=>{e.target.style.borderColor=G.green;setDropOpen(true);}}
              onBlur={e=>{e.target.style.borderColor=G.border;setTimeout(()=>setDropOpen(false),180);}}
              placeholder="Search Bitcoin, Ethereum, Solana…"
            />
            {selected&&<img src={selected.image} alt="" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",width:24,height:24,borderRadius:"50%"}}/>}
            {dropOpen&&!selected&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:200,background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,maxHeight:280,overflowY:"auto",boxShadow:"0 8px 30px rgba(0,0,0,0.1)"}}>
                {filtered.slice(0,30).map((a,idx)=>(
                  <div key={a.id} onMouseDown={()=>{setSelected(a);setSearch("");setDropOpen(false);}}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",borderBottom:idx<29?`1px solid ${G.border}`:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.background=G.surfaceAlt}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <img src={a.image} alt={a.symbol} style={{width:30,height:30,borderRadius:"50%",flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
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
          </div>}

          {selected&&(
            <div style={{marginTop:14,padding:14,background:G.surfaceAlt,borderRadius:12,border:`1px solid ${G.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <img src={selected.image} alt="" style={{width:36,height:36,borderRadius:"50%"}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{selected.name} <span style={{color:G.muted,fontWeight:400,fontSize:12}}>#{selected.market_cap_rank}</span></div>
                  {loadingLive?<div style={{fontSize:12,color:G.muted}}>Getting live price…</div>
                  :livePrice?<div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,fontSize:18,color:G.dark}}>{fmtPrice(livePrice.price)}</span>
                    <PctBadge val={livePrice.change24h}/><span style={{fontSize:11,color:G.muted}}>· live</span>
                  </div>:<div style={{fontSize:14,fontWeight:700}}>{fmtPrice(selected.current_price)}</div>}
                </div>
                {analysis&&<TrendPill trend={analysis.trend}/>}
              </div>
              {loadingHist&&<div style={{marginTop:8,fontSize:12,color:G.muted}}>Analysing price history…</div>}
              {analysis&&(
                <div style={{marginTop:10,background:analysis.verdictBg,border:`1.5px solid ${analysis.verdictColor}40`,borderRadius:12,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:18,flexShrink:0}}>{analysis.score>=3?"🔥":analysis.score>=1?"✅":analysis.score>=-1?"⚠️":"❌"}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:analysis.verdictColor}}>{analysis.verdict}</div>
                    <div style={{fontSize:13,color:G.muted,marginTop:2}}>{analysis.verdictDesc}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 2 */}
        <div style={card}>
          <div style={secLabel}><span style={stepNum}>2</span>Build Your Plan</div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:6}}>Total money to invest (USD)</label>
            <input type="number" style={inp} value={capital} min={10}
              onChange={e=>setCapital(Math.max(1,Number(e.target.value)))}
              onFocus={e=>e.target.style.borderColor=G.green}
              onBlur={e=>e.target.style.borderColor=G.border}
            />
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
            <div style={{fontSize:12,color:G.muted,marginTop:6}}>Max {freq.maxMonths} months · Each purchase: <strong>{fmtUSD(Number(capital)/Math.max(4,Math.round((safeMo*30)/freq.days)))}</strong></div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:8}}>Over how long? <span style={{color:G.green,fontWeight:900}}>{safeMo} month{safeMo!==1?"s":""}</span></label>
            <input type="range" min={1} max={maxMo} value={safeMo} step={1} onChange={e=>setMonths(Number(e.target.value))} style={{width:"100%",accentColor:G.green}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:G.muted}}><span>1 month</span><span>{maxMo} months</span></div>
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

        {/* SIMULATE BTN */}
        {selected&&history&&(
          <button onClick={handleSim} disabled={simState==="running"} style={{width:"100%",padding:"16px",borderRadius:14,cursor:simState==="running"?"not-allowed":"pointer",fontFamily:"inherit",fontSize:17,fontWeight:800,border:"none",background:simState==="running"?"#D1D5DB":`linear-gradient(135deg,${G.green},${G.green2})`,color:simState==="running"?"#9CA3AF":"#fff",marginBottom:14,boxShadow:simState==="running"?"none":"0 4px 18px rgba(22,163,74,0.32)",transition:"all 0.2s"}}>
            {simState==="running"?<><Spinner/>&nbsp; {simMsg}</>:simState==="done"?"Recalculate ↻":"Show Me the Numbers →"}
          </button>
        )}

        {/* RESULTS */}
        {simState==="done"&&sim&&selected&&analysis&&(()=>{
          const totalInvested=sim.amtPer*sim.entries;
          const aggressive=targetPct>analysis.volPct*2;
          const good=analysis.score>=1;
          return(<>
            {/* TARGET */}
            <div style={{borderRadius:18,padding:"26px 24px",marginBottom:14,background:good?"linear-gradient(135deg,#F0FDF4,#DCFCE7)":"linear-gradient(135deg,#FEF2F2,#FFE4E6)",border:`2px solid ${good?G.greenBorder:G.redBorder}`}}>
              <div style={{fontSize:13,fontWeight:800,color:good?G.green:G.red,letterSpacing:1.5,textTransform:"uppercase"}}>{good?"🎯 If your target hits":"⚠️ Reality check — if your target hits"}</div>
              <div style={{fontSize:13,color:G.muted,marginTop:4}}>{selected.symbol.toUpperCase()} reaches {fmtPrice(sim.targetPrice)} (+{targetPct}%)</div>
              <div style={{fontSize:"clamp(38px,6vw,56px)",fontWeight:900,lineHeight:1.05,margin:"8px 0 4px",color:good?G.green:G.red}}>{fmtUSD(sim.targetVal)}</div>
              <div style={{fontSize:16,fontWeight:800,color:G.dark,marginBottom:8}}>
                You profit <span style={{color:good?G.green:G.red}}>+{fmtUSD(sim.targetProfit)}</span> on {fmtUSD(totalInvested)} invested
                <span style={{background:good?G.green:G.red,color:"#fff",borderRadius:20,padding:"2px 12px",fontSize:14,marginLeft:8}}>+{sim.targetROI.toFixed(0)}%</span>
              </div>
              {aggressive&&<div style={{background:G.amberPale,border:`1px solid ${G.amberBorder}`,borderRadius:10,padding:"10px 14px",fontSize:13,color:G.amber}}>⚠️ This target is bigger than recent market moves suggest. Possible — but needs a strong rally.</div>}
            </div>

            {/* BREAKDOWN */}
            <div style={card}>
              <div style={secLabel}>Your DCA Breakdown</div>
              {[
                ["You buy",`${fmtUSD(sim.amtPer)} per purchase`],
                ["Number of purchases",`${sim.entries} times`],
                ["Total money in",fmtUSD(totalInvested)],
                ["Average buy price",fmtPrice(sim.avgEntry)],
                [`Total ${selected.symbol.toUpperCase()} you'll own`,fmtTok(sim.totalTokens)],
              ].map(([l,v],i,a)=>(
                <div key={l} style={{...statRow,borderBottom:i<a.length-1?`1px solid ${G.border}`:"none"}}>
                  <span style={{fontSize:14,color:G.muted}}>{l}</span>
                  <span style={{fontSize:14,fontWeight:700,color:G.text}}>{v}</span>
                </div>
              ))}
              <div style={{...statRow,borderBottom:"none"}}>
                <span style={{fontSize:14,color:G.muted}}>Value right now at {fmtPrice(sim.refPrice)}</span>
                <span style={{fontSize:14,fontWeight:700,color:sim.currentROI>=0?G.green:G.red}}>{fmtUSD(sim.currentVal)} ({fmtPct(sim.currentROI)})</span>
              </div>
            </div>

            {/* SCENARIOS */}
            <div style={card}>
              <div style={secLabel}>What if the price moves differently?</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {label:"Price stays flat",plain:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.flatVal)} back — zero gain`,roi:"±0%",c:G.amber,bg:G.amberPale,b:G.amberBorder},
                  {label:`Drops 20% → ${fmtPrice(sim.avgEntry*0.8)}`,plain:`${fmtUSD(totalInvested)} in → ${fmtUSD(sim.downVal)} back — you're down ${fmtUSD(Math.abs(sim.downLoss))}`,roi:"-20%",c:G.red,bg:G.redPale,b:G.redBorder},
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

            {/* MARKET */}
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

            {/* CARD GENERATOR */}
            <div style={card}>
              <div style={secLabel}>🔥 Make Your Share Card</div>
              <p style={{fontSize:14,color:G.muted,marginTop:0,marginBottom:16}}>A bold card for X, Instagram or Telegram. People see your full strategy at a glance.</p>

              <div style={{marginBottom:12}}>
                <label style={{fontSize:13,fontWeight:700,color:G.sub,display:"block",marginBottom:6}}>Your name (shows on the card)</label>
                <input type="text" placeholder="e.g. Alex or @alex_dca" style={inp} value={userName} maxLength={28}
                  onChange={e=>setUserName(e.target.value)}
                  onFocus={e=>e.target.style.borderColor=G.green}
                  onBlur={e=>e.target.style.borderColor=G.border}
                />
              </div>

              <label style={{display:"block",padding:"10px 14px",background:G.surfaceAlt,border:`1.5px dashed ${G.greenBorder}`,borderRadius:12,cursor:"pointer",color:G.muted,fontSize:13,textAlign:"center",marginBottom:14}}>
                {profileImg?"✅ Photo added — click to swap":"📷 Add your profile photo (optional)"}
                <input type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setProfileImg(ev.target.result);r.readAsDataURL(f);}} style={{display:"none"}}/>
              </label>

              <button onClick={handleCard} disabled={genCard} style={{width:"100%",padding:"14px",borderRadius:12,cursor:genCard?"not-allowed":"pointer",fontFamily:"inherit",fontSize:15,fontWeight:800,border:"none",background:genCard?"#D1D5DB":G.green,color:genCard?"#9CA3AF":"#fff",marginBottom:12,boxShadow:genCard?"none":"0 4px 16px rgba(22,163,74,0.28)"}}>
                {genCard?"Generating…":"⚡ Generate My Card"}
              </button>

              {cardUrl&&<>
                <img src={cardUrl} alt="Share card" style={{width:"100%",borderRadius:14,marginBottom:12,border:`1px solid ${G.border}`}}/>
                <button onClick={()=>{const a=document.createElement("a");a.href=cardUrl;a.download=`cmvng-${selected.symbol}-dca.png`;a.click();}}
                  style={{width:"100%",padding:"13px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:800,border:`2px solid ${G.green}`,background:G.greenPale,color:G.green}}>
                  ⬇ Download · Ready for X & Instagram
                </button>
              </>}
            </div>
          </>);
        })()}

        <div style={{textAlign:"center",fontSize:12,color:G.muted,marginTop:16}}>
          CMVNG DCA Simulator · Not financial advice · DYOR · Data via CoinGecko
        </div>
      </main>
    </div>
  );
}
