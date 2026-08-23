import type { Address, Hash } from "viem";

export interface GeneralAssetCandidateV1 {
  chainId: 1 | 196;
  token: Address;
  symbol: string;
  name: string;
  decimals: number;
  status: "eligible" | "verification_pending" | "unsupported";
  reason?: string;
  identityHash?: Hash;
  valuationHash?: Hash;
}

export type GeneralAssetSelectionV1 =
  | { chainId: 1 | 196; token: Address }
  | { chainId: 1 | 196; symbol: string };

export interface GeneralAssetDraftV1 {
  kind: "general-asset-draft";
  templateId: "general-asset";
  displayGoal: string;
  sourceChainId: 1 | 196;
  destinationChainId: 1 | 196;
  manifestHash: Hash;
  input: {
    token: Address;
    symbol: string;
    decimals: number;
    maximumAtomic: string;
    maximumUsdE8: string;
    identityHash: Hash;
    valuationHash: Hash;
  };
  output: {
    token: Address;
    symbol: string;
    decimals: number;
    minimumAtomic: string;
    identityHash: Hash;
  };
  allowedAdapters: Array<{ id: string; version: number }>;
  limits: {
    maxStages: number;
    maxCallsPerStage: number;
    maxApprovals: number;
    maxCalldataBytes: number;
    maxGasPerStage: string;
    maxNativeValueUsdE8: string;
    maxBridgeFeeUsdE8: string;
    maxSolverFeeUsdE8: string;
    maxConversionLossBps: number;
    maxSlippageBps: number;
  };
}

export type GeneralAssetDraftResultV1 =
  | { status: "review"; values: GeneralAssetDraftV1 }
  | { status: "clarification"; question: string };

const POSITIVE = /^[1-9][0-9]*$/;
const ROUTE_CAP_USD_E8 = 100_000_000_000n;

function chainName(chainId: 1 | 196): string {
  return chainId === 1 ? "Ethereum" : "X Layer";
}

function findCandidate(
  candidates: readonly GeneralAssetCandidateV1[],
  selection: GeneralAssetSelectionV1,
): GeneralAssetCandidateV1 | GeneralAssetCandidateV1[] | undefined {
  if ("token" in selection) return candidates.find((candidate) =>
    candidate.chainId === selection.chainId &&
    candidate.token.toLowerCase() === selection.token.toLowerCase());
  const matches = candidates.filter((candidate) => candidate.chainId === selection.chainId &&
    candidate.symbol.toLowerCase() === selection.symbol.toLowerCase());
  return matches.length === 1 ? matches[0] : matches;
}

function requireEligible(
  value: GeneralAssetCandidateV1 | GeneralAssetCandidateV1[] | undefined,
  selection: GeneralAssetSelectionV1,
  valuation: boolean,
): GeneralAssetCandidateV1 | { question: string } {
  if (Array.isArray(value)) {
    if (value.length > 1 && "symbol" in selection) return {
      question: `${selection.symbol} matches multiple contracts on ${chainName(selection.chainId)}. Select the exact address.`,
    };
    return { question: "Select an exact token contract." };
  }
  if (!value) return { question: "The selected token contract is unavailable." };
  if (value.status !== "eligible") return {
    question: value.reason ?? "Independent asset verification has not completed.",
  };
  if (!value.identityHash || (valuation && !value.valuationHash)) return {
    question: "Verified asset commitments are unavailable. Try again after verification completes.",
  };
  return value;
}

export function compileGeneralAssetDraftV1(input: {
  goal: string;
  owner: Address;
  selection: { input: GeneralAssetSelectionV1; output: GeneralAssetSelectionV1 };
  maximumInputAtomic: string;
  maximumInputUsdE8: string;
  minimumOutputAtomic: string;
  manifestHash: Hash;
  candidates: readonly GeneralAssetCandidateV1[];
}): GeneralAssetDraftResultV1 {
  if (![input.maximumInputAtomic, input.maximumInputUsdE8, input.minimumOutputAtomic]
    .every((value) => POSITIVE.test(value))) {
    return { status: "clarification", question: "Enter positive atomic and USD input/output bounds." };
  }
  if (BigInt(input.maximumInputUsdE8) > ROUTE_CAP_USD_E8) {
    return { status: "clarification", question: "Maximum input cannot exceed $1,000 per route." };
  }
  const inputAsset = requireEligible(
    findCandidate(input.candidates, input.selection.input), input.selection.input, true,
  );
  if ("question" in inputAsset) return { status: "clarification", question: inputAsset.question };
  const outputAsset = requireEligible(
    findCandidate(input.candidates, input.selection.output), input.selection.output, false,
  );
  if ("question" in outputAsset) return { status: "clarification", question: outputAsset.question };
  if (inputAsset.chainId !== outputAsset.chainId) {
    return { status: "clarification",
      question: "Cross-chain general asset swaps are temporarily unavailable. Choose both tokens on the same chain." };
  }

  return { status: "review", values: {
    kind: "general-asset-draft",
    templateId: "general-asset",
    displayGoal: input.goal.trim(),
    sourceChainId: inputAsset.chainId,
    destinationChainId: outputAsset.chainId,
    manifestHash: input.manifestHash,
    input: {
      token: inputAsset.token.toLowerCase() as Address,
      symbol: inputAsset.symbol,
      decimals: inputAsset.decimals,
      maximumAtomic: input.maximumInputAtomic,
      maximumUsdE8: input.maximumInputUsdE8,
      identityHash: inputAsset.identityHash!,
      valuationHash: inputAsset.valuationHash!,
    },
    output: {
      token: outputAsset.token.toLowerCase() as Address,
      symbol: outputAsset.symbol,
      decimals: outputAsset.decimals,
      minimumAtomic: input.minimumOutputAtomic,
      identityHash: outputAsset.identityHash!,
    },
    allowedAdapters: [{ id: "okx.swap", version: 1 }],
    limits: {
      maxStages: 8,
      maxCallsPerStage: 8,
      maxApprovals: 16,
      maxCalldataBytes: 16_384,
      maxGasPerStage: "4000000",
      maxNativeValueUsdE8: "1000000000",
      maxBridgeFeeUsdE8: "5000000000",
      maxSolverFeeUsdE8: "0",
      maxConversionLossBps: 500,
      maxSlippageBps: 300,
    },
  } };
}
