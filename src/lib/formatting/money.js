// Money/price/token formatters — v1-preserved output shapes.

export const fmtUSD = n => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${a.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `${s}$${a.toFixed(2)}`;
};

export const fmtUSDPrecise = n => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  return `${s}$${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtPrice = n =>
  n >= 1000 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : n >= 1 ? `$${n.toFixed(2)}`
  : `$${n.toPrecision(4)}`;

export const fmtTok = n =>
  n < 0.001 ? n.toFixed(8) : n < 1 ? n.toFixed(4) : n < 1000 ? n.toFixed(3) : n.toFixed(1);
