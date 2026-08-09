import {
  AaveCandidateSchema,
  type MarketCandidate,
  type MarketSnapshot,
} from "@cobia/domain";
import { isAddress, type Address } from "viem";
import type { RawProductDetail } from "./client";

interface NormalizeAaveOptions {
  expectedSymbol: string;
  poolAddress: Address;
  retrievedAt: string;
}

type AaveCandidate = Extract<MarketCandidate, { kind: "aave-v3" }>;

export interface NormalizedAaveProduct {
  asset: MarketSnapshot["asset"];
  candidate: AaveCandidate;
}

export function decimalToScaledInteger(value: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new TypeError("Scale must be a non-negative integer");
  }
  const match = value.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new TypeError(`Invalid unsigned decimal: ${value}`);
  const fraction = (match[2] ?? "").slice(0, scale).padEnd(scale, "0");
  return BigInt(match[1]) * 10n ** BigInt(scale) + BigInt(fraction || "0");
}

function toSafeNumber(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${field} exceeds safe integer range`);
  }
  return Number(value);
}

export function normalizeAaveProduct(
  detail: RawProductDetail,
  options: NormalizeAaveOptions,
): NormalizedAaveProduct {
  if (detail.chainIndex !== "196") throw new Error("Product is not on X Layer");
  if (detail.platformName !== "Aave V3") throw new Error("Product is not Aave V3");
  if (!detail.isInvestable) throw new Error("Product is not investable");
  if (detail.underlyingToken.length !== 1) {
    throw new Error("Aave product must have one underlying asset");
  }

  const token = detail.underlyingToken[0];
  if (token.chainIndex !== "196" || token.tokenSymbol !== options.expectedSymbol) {
    throw new Error("Product does not contain the expected asset");
  }
  if (!isAddress(token.tokenAddress)) throw new Error("Invalid underlying token address");
  if (!isAddress(options.poolAddress)) throw new Error("Invalid Aave pool address");
  if (!Number.isInteger(token.tokenPrecision) || token.tokenPrecision < 0 || token.tokenPrecision > 36) {
    throw new Error("Invalid underlying token precision");
  }
  if (Number.isNaN(Date.parse(options.retrievedAt))) {
    throw new Error("Invalid retrieval timestamp");
  }

  const apyBps = toSafeNumber(decimalToScaledInteger(detail.rate, 4), "APY");
  const utilizationBps = toSafeNumber(
    decimalToScaledInteger(detail.utilizationRate, 4),
    "Utilization",
  );
  if (utilizationBps > 10_000) throw new Error("Invalid utilization rate");

  return {
    asset: {
      address: token.tokenAddress,
      symbol: token.tokenSymbol,
      decimals: token.tokenPrecision,
    },
    candidate: AaveCandidateSchema.parse({
      id: `aave-v3:${detail.investmentId}`,
      kind: "aave-v3",
      investmentId: detail.investmentId,
      poolAddress: options.poolAddress,
      apyBps,
      tvlUsdE6: decimalToScaledInteger(detail.tvl, 6).toString(),
      utilizationBps,
      retrievedAt: options.retrievedAt,
    }),
  };
}
