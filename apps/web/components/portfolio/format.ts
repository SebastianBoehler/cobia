const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const timestamp = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatUsd(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? usd.format(parsed) : "Unavailable";
}

export function formatSignedUsd(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Unavailable";
  if (parsed > 0) return `+${usd.format(parsed)}`;
  if (parsed < 0) return `−${usd.format(Math.abs(parsed))}`;
  return usd.format(0);
}

export function formatSignedPercent(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Unavailable";
  const formatted = `${Math.abs(parsed).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
  return parsed > 0 ? `+${formatted}` : parsed < 0 ? `−${formatted}` : formatted;
}

export function formatAmount(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? decimal.format(parsed) : value;
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown time" : `${timestamp.format(parsed)} UTC`;
}

export function valueFromBalance(formatted: string, priceUsd?: string): string | undefined {
  if (!priceUsd) return undefined;
  const value = Number(formatted) * Number(priceUsd);
  return Number.isFinite(value) ? formatUsd(value) : undefined;
}

export function formatCount(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}
