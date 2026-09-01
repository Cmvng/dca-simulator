export function formatUsd(value, { compact = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number < 0 ? "-" : "";
  const absolute = Math.abs(number);

  if (compact && absolute >= 1_000_000_000) return `${sign}$${(absolute / 1_000_000_000).toFixed(2)}B`;
  if (compact && absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  if (compact && absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;

  return `${sign}$${absolute.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  if (number >= 1_000) return `$${number.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (number >= 1) return `$${number.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (number >= 0.01) return `$${number.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (number < 1e-18) return `$${number.toExponential(4)}`;

  const exponent = Math.floor(Math.log10(number));
  const decimals = Math.min(18, Math.max(8, Math.abs(exponent) + 4));
  return `$${number.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

export function compactAddress(address, head = 6, tail = 5) {
  if (!address) return "—";
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function formatTokenAmount(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: number >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: number < 1 ? 6 : 2,
  }).format(number);
}
