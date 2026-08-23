import {
  AssetValuationEvidenceV1Schema,
  type AssetValuationEvidenceV1,
} from "@cobia/domain";
import type { Hash } from "viem";
import type { GeneralAsset } from "./identity";

export interface ExecutableValuationQuoteV1 {
  adapter: { id: string; version: number };
  outputAtomic: string;
  assetDecimals: number;
  unitPriceUsdE8: string;
  liquidityUsdE8: string;
  priceImpactBps: number;
  fetchedAtSec: number;
  expiresAtSec: number;
  quoteHash: Hash;
}

export interface AssetValuationInputV1 {
  asset: GeneralAsset;
  assetIdentityHash: Hash;
  inputAtomic: string;
  referenceAsset: GeneralAsset;
  trustedReferenceAssets: GeneralAsset[];
  minimumLiquidityUsdE8: string;
  maximumDisagreementBps: number;
  quotes: ExecutableValuationQuoteV1[];
}

export interface ValuationVerificationResultV1 {
  errorCodes: string[];
  evidence?: AssetValuationEvidenceV1;
}

function sameAsset(left: GeneralAsset, right: GeneralAsset): boolean {
  return left.chainId === right.chainId && left.token === right.token;
}

function valueUsdE8(inputAtomic: string, unitPriceUsdE8: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("Valuation asset decimals are invalid");
  }
  const denominator = 10n ** BigInt(decimals);
  const numerator = BigInt(inputAtomic) * BigInt(unitPriceUsdE8);
  return (numerator + denominator - 1n) / denominator;
}

export function verifyExecutableValuationV1(
  requestedAsset: GeneralAsset,
  valuation: AssetValuationInputV1,
  capturedAtSec: number,
  evidenceExpiresAtSec: number,
  nowSec: number,
): ValuationVerificationResultV1 {
  const errors = new Set<string>();
  if (!sameAsset(requestedAsset, valuation.asset)) errors.add("VALUATION_ASSET_MISMATCH");
  if (!valuation.trustedReferenceAssets.some((asset) => sameAsset(asset, valuation.referenceAsset))) {
    errors.add("VALUATION_REFERENCE_UNTRUSTED");
  }
  if (valuation.quotes.length === 0) errors.add("VALUATION_MISSING");

  const keys = valuation.quotes.map(({ adapter }) => `${adapter.id}@${adapter.version}`);
  if (!keys.every((key, index) => index === 0 || keys[index - 1]! < key)) {
    errors.add("VALUATION_ADAPTERS_NOT_CANONICAL");
  }
  for (const quote of valuation.quotes) {
    if (quote.fetchedAtSec > nowSec || quote.expiresAtSec <= nowSec ||
        quote.expiresAtSec < evidenceExpiresAtSec) errors.add("VALUATION_QUOTE_EXPIRED");
    if (BigInt(quote.liquidityUsdE8) < BigInt(valuation.minimumLiquidityUsdE8)) {
      errors.add("VALUATION_LIQUIDITY_INSUFFICIENT");
    }
    if (!Number.isInteger(quote.assetDecimals) || quote.assetDecimals < 0 ||
        quote.assetDecimals > 36 || BigInt(quote.unitPriceUsdE8) <= 0n) {
      errors.add("VALUATION_PRICE_INVALID");
    }
  }

  if (errors.has("VALUATION_PRICE_INVALID")) return { errorCodes: [...errors].sort() };

  const evidenceQuotes = valuation.quotes.map(({ assetDecimals, unitPriceUsdE8, ...quote }) => ({
    ...quote,
    referenceValueUsdE8: valueUsdE8(valuation.inputAtomic, unitPriceUsdE8, assetDecimals).toString(),
  }));
  const values = evidenceQuotes.map(({ referenceValueUsdE8 }) => BigInt(referenceValueUsdE8));
  if (values.length > 1) {
    const minimum = values.reduce((left, right) => left < right ? left : right);
    const maximum = values.reduce((left, right) => left > right ? left : right);
    if ((maximum - minimum) * 10_000n > maximum * BigInt(valuation.maximumDisagreementBps)) {
      errors.add("VALUATION_PRICE_DISAGREEMENT");
    }
  }
  if (errors.size > 0) return { errorCodes: [...errors].sort() };

  const conservativeValueUsdE8 = values.reduce((left, right) => left > right ? left : right).toString();
  return {
    errorCodes: [],
    evidence: AssetValuationEvidenceV1Schema.parse({
      version: 1,
      assetIdentityHash: valuation.assetIdentityHash,
      referenceAsset: valuation.referenceAsset,
      inputAtomic: valuation.inputAtomic,
      conservativeValueUsdE8,
      maximumDisagreementBps: valuation.maximumDisagreementBps,
      quotes: evidenceQuotes,
      capturedAtSec,
      expiresAtSec: evidenceExpiresAtSec,
    }),
  };
}
