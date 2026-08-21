import { formatUnits } from "viem";

export function formatTokenAmount(atomic: string, decimals: number): string {
  if (!/^-?\d+$/.test(atomic)) return atomic;
  const amount = formatUnits(BigInt(atomic), decimals);
  if (decimals === 0) return amount;
  const [whole, fraction = ""] = amount.split(".");
  return `${whole}.${fraction.padEnd(decimals, "0")}`;
}
