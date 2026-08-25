import { commitment, type AssetIdentityEvidenceV1, type AssetValuationEvidenceV1 } from "@cobia/domain";
import {
  verifyAssetIdentityV1,
  verifyExecutableValuationV1,
  verifyPlainErc20BehaviorV1,
  type AssetIdentityAnchorV1,
  type ClaimedAssetIdentityV1,
  type PinnedAssetReaderV1,
  type PlainErc20ProbeV1,
} from "@cobia/solvers";
import type { Address, Hash } from "viem";
import { OKX_USD_VALUATION_ASSETS } from "../okx/client";

type ChainId = 1 | 196;
interface MarketEvidence {
  chainId: ChainId;
  token: Address;
  decimals: number;
  priceUsd?: string;
  liquidityUsd?: string;
  marketDataAt: string;
  topHolderAddresses: Address[];
}
interface Dependencies {
  nowSec(): number;
  market: {
    getTokenEvidence(chainId: ChainId, token: Address): Promise<MarketEvidence>;
    getExecutableQuote(chainId: ChainId, token: Address, inputAtomic: string): Promise<{
      chainId: ChainId; fromToken: Address; toToken: Address; inputAtomic: string;
      outputAtomic: string; outputDecimals: number; priceImpactBps: number;
      fetchedAt: string; route: unknown;
    }>;
  };
  captureIdentity(asset: { chainId: ChainId; token: Address }): Promise<{
    anchor: AssetIdentityAnchorV1;
    claimedIdentity: ClaimedAssetIdentityV1;
    reader: PinnedAssetReaderV1;
  }>;
  replayProbe(input: { chainId: ChainId; token: Address; source: Address;
    blockNumber: string; probeAtomic: string }): Promise<PlainErc20ProbeV1>;
  minimumLiquidityUsdE8?: string;
}

export interface OkxGeneralAssetEligibilityOptions {
  behaviorVerification?: "required" | "deferred";
}

export type OkxGeneralAssetEligibilityV2 =
  | { status: "eligible"; identityHash: Hash; valuationHash?: Hash;
    identityEvidence: AssetIdentityEvidenceV1; valuationEvidence?: AssetValuationEvidenceV1 }
  | { status: "verification_pending" | "unsupported"; reason: string };

const MARKET_MAX_AGE_SEC = 120;
const DEFAULT_MINIMUM_LIQUIDITY_USD_E8 = "10000000000000";

function decimalUsdE8(value: string, roundUp: boolean): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("OKX decimal value is invalid");
  const [whole, fraction = ""] = value.split(".");
  const head = fraction.slice(0, 8).padEnd(8, "0");
  const remainder = fraction.slice(8);
  return BigInt(whole!) * 100_000_000n + BigInt(head) +
    (roundUp && /[1-9]/.test(remainder) ? 1n : 0n);
}

function unsupportedReason(errorCodes: readonly string[]): string {
  if (errorCodes.includes("ASSET_BLACKLIST_CONTROL_UNSUPPORTED")) {
    return "Token blacklist or pause controls are unsupported.";
  }
  if (errorCodes.includes("ASSET_ADMIN_BALANCE_CONTROL_UNSUPPORTED")) {
    return "Token administrative balance controls are unsupported.";
  }
  if (errorCodes.includes("VALUATION_LIQUIDITY_INSUFFICIENT")) {
    return "OKX executable liquidity is insufficient.";
  }
  if (errorCodes.some((code) => code.startsWith("VALUATION_"))) {
    return "OKX valuation evidence is unsupported.";
  }
  return `Token behavior is unsupported (${errorCodes.join(", ")}).`;
}

export function createOkxGeneralAssetEligibilityV2(deps: Dependencies,
  options: OkxGeneralAssetEligibilityOptions = {}) {
  return { async eligibility(input: { chainId: ChainId; token: Address; inputAtomic?: string }) {
    try {
      const nowSec = deps.nowSec();
      const behaviorVerification = options.behaviorVerification ?? "required";
      if (input.inputAtomic !== undefined && !/^[1-9][0-9]*$/.test(input.inputAtomic)) {
        return { status: "unsupported" as const, reason: "Input amount must be a positive atomic value." };
      }
      const asset = { chainId: input.chainId, token: input.token };
      const usdValuationAsset = { chainId: input.chainId,
        token: OKX_USD_VALUATION_ASSETS[input.chainId] };
      const alreadyUsdDenominated = asset.token === usdValuationAsset.token;
      const [market, captured, executable] = await Promise.all([
        deps.market.getTokenEvidence(input.chainId, input.token), deps.captureIdentity(asset),
        input.inputAtomic && !alreadyUsdDenominated
          ? deps.market.getExecutableQuote(input.chainId, input.token, input.inputAtomic)
          : Promise.resolve(undefined),
      ]);
      if (market.chainId !== input.chainId || market.token !== input.token ||
          market.decimals !== captured.claimedIdentity.decimals) {
        return { status: "unsupported" as const, reason: "Token chain, address, or decimals do not match." };
      }
      const marketSec = Math.floor(new Date(market.marketDataAt).getTime() / 1_000);
      const marketIsFresh = Number.isSafeInteger(marketSec) && marketSec <= nowSec &&
        nowSec - marketSec <= MARKET_MAX_AGE_SEC;
      const requiresFreshMarket = behaviorVerification === "required" ||
        (input.inputAtomic !== undefined && !executable);
      if (requiresFreshMarket && !marketIsFresh) {
        return { status: "verification_pending" as const, reason: "Authenticated OKX evidence is stale." };
      }
      if (behaviorVerification === "required" && !market.topHolderAddresses[0]) {
        return { status: "verification_pending" as const, reason: "No token holder is available for behavior replay." };
      }
      const executableSec = executable
        ? Math.floor(new Date(executable.fetchedAt).getTime() / 1_000) : nowSec;
      if (executable && (!Number.isSafeInteger(executableSec) || executableSec > nowSec ||
          nowSec - executableSec > 30 || executable.chainId !== input.chainId ||
          executable.fromToken !== input.token ||
          executable.toToken !== OKX_USD_VALUATION_ASSETS[input.chainId] ||
          executable.inputAtomic !== input.inputAtomic)) {
        return { status: "verification_pending" as const, reason: "Authenticated OKX quote is stale or mismatched." };
      }
      const expiresAtSec = Math.min(captured.anchor.expiresAtSec,
        input.inputAtomic && marketIsFresh ? marketSec + MARKET_MAX_AGE_SEC : Number.MAX_SAFE_INTEGER,
        executable ? executableSec + 30 : Number.MAX_SAFE_INTEGER);
      if (expiresAtSec <= nowSec) {
        return { status: "verification_pending" as const, reason: "Authenticated OKX evidence is stale." };
      }
      const anchor = { ...captured.anchor, expiresAtSec };
      const [identity, behaviorErrors] = await Promise.all([
        verifyAssetIdentityV1({ asset, anchor, claimedIdentity: captured.claimedIdentity,
          reader: captured.reader, nowSec }),
        behaviorVerification === "required"
          ? verifyPlainErc20BehaviorV1({ probePlainErc20: () => deps.replayProbe({
            chainId: input.chainId, token: input.token, source: market.topHolderAddresses[0]!,
            blockNumber: anchor.blockNumber, probeAtomic: "1",
          }) }, asset, anchor)
          : Promise.resolve([]),
      ]);
      const initialErrors = [...new Set([...identity.errorCodes, ...behaviorErrors])].sort();
      if (initialErrors.length || !identity.evidence) {
        return { status: "unsupported" as const, reason: unsupportedReason(initialErrors) };
      }
      const identityHash = commitment(identity.evidence) as Hash;
      if (!input.inputAtomic) {
        return { status: "eligible" as const, identityHash, identityEvidence: identity.evidence };
      }
      const inputAtomic = input.inputAtomic;
      if (!market.priceUsd || !market.liquidityUsd) {
        return { status: "verification_pending" as const,
          reason: "Authenticated OKX valuation metadata is unavailable." };
      }
      const priceUsdE8 = decimalUsdE8(market.priceUsd, true);
      const liquidityUsdE8 = decimalUsdE8(market.liquidityUsd, false);
      const executableQuote = executable ? (() => {
        const executableValueUsdE8 = (BigInt(executable.outputAtomic) * 100_000_000n +
          10n ** BigInt(executable.outputDecimals) - 1n) / 10n ** BigInt(executable.outputDecimals);
        const executableUnitPriceUsdE8 = (executableValueUsdE8 *
          10n ** BigInt(market.decimals) + BigInt(inputAtomic) - 1n) / BigInt(inputAtomic);
        return { adapter: { id: "okx.swap", version: 1 }, outputAtomic: executable.outputAtomic,
          assetDecimals: market.decimals, unitPriceUsdE8: executableUnitPriceUsdE8.toString(),
          liquidityUsdE8: liquidityUsdE8.toString(),
          priceImpactBps: executable.priceImpactBps, fetchedAtSec: executableSec, expiresAtSec,
          quoteHash: commitment({ provider: "okx.swap@1", executable }) as Hash };
      })() : undefined;
      const valuation = verifyExecutableValuationV1(asset, {
        asset, assetIdentityHash: identityHash, inputAtomic,
        referenceAsset: usdValuationAsset, trustedReferenceAssets: [usdValuationAsset],
        minimumLiquidityUsdE8: deps.minimumLiquidityUsdE8 ?? DEFAULT_MINIMUM_LIQUIDITY_USD_E8,
        maximumDisagreementBps: 500,
        quotes: [...(marketIsFresh ? [{ adapter: { id: "okx.market", version: 1 },
          outputAtomic: ((BigInt(inputAtomic) * priceUsdE8 +
            10n ** BigInt(market.decimals) - 1n) / 10n ** BigInt(market.decimals)).toString(),
          assetDecimals: market.decimals, unitPriceUsdE8: priceUsdE8.toString(),
          liquidityUsdE8: liquidityUsdE8.toString(), priceImpactBps: 0,
          fetchedAtSec: marketSec, expiresAtSec,
          quoteHash: commitment({ provider: "okx.market@1", market, inputAtomic }) as Hash }] : []),
        ...(executableQuote ? [executableQuote] : [])],
      }, captured.anchor.capturedAtSec, expiresAtSec, nowSec);
      if (valuation.errorCodes.length || !valuation.evidence) {
        return { status: "unsupported" as const, reason: unsupportedReason(valuation.errorCodes) };
      }
      return { status: "eligible" as const, identityHash,
        valuationHash: commitment(valuation.evidence) as Hash,
        identityEvidence: identity.evidence, valuationEvidence: valuation.evidence };
    } catch {
      return { status: "verification_pending" as const,
        reason: "Fresh independent token verification is unavailable." };
    }
  } };
}
