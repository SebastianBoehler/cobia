import {
  isNativeAssetAddress, OpenIntentPolicyV3Schema, type OpenIntentPolicyV3,
} from "@cobia/domain";
import { isAddressEqual, type Address, type Hash } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";

const DEADLINE_LIFETIME_SEC = 30 * 60;
const MAX_COMPETITION_DURATION_SEC = 15 * 60;
const MAX_REVISIONS_PER_SOLVER = 5;
const RECEIPT_FLOOR_BPS = 9_950n;

interface CommonInput {
  requestId: string;
  owner: Address;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  competitionDurationSec: number;
  maxSolverFeeAtomic: string;
  forbiddenTargets: Address[];
}

type LegacyBuildInput = CommonInput & { inputToken: Address; inputAtomic: string } & (
  | { templateId: "aave-supply"; exposureBps: number }
  | { templateId: "exact-input-swap"; outputToken: Address; minimumOutputAtomic: string }
  | { templateId: "round-trip"; minimumProfitAtomic: string }
  | { templateId: "rwa-acquisition"; outputToken: Address; minimumOutputAtomic: string;
      outputChainId: 1 | 196 }
  | { templateId: "rwa-acquisition"; outputToken: Address; minimumOutputAtomic: string;
      instrumentCommitment: Hash; jurisdiction: string; instrumentChainId: 1 | 196 }
);
type BuildInput = LegacyBuildInput | CommonInput & { templateId: "staged-conversion";
  inputs: Array<{ token: Address; maximumAtomic: string }>;
  outputToken: Address; minimumOutputAtomic: string; minimumStages?: number };

function positive(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive atomic amount`);
  return BigInt(value);
}

function receiptToken(inputToken: Address): Address {
  const entry = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, inputToken));
  if (!entry) throw new Error("Earn input has no registered receipt identity");
  return entry.aToken.address.toLowerCase() as Address;
}

function receiptExitStageCount(inputs: Array<{ token: Address }>, outputToken: Address): number {
  return inputs.filter(({ token }) => {
    const receipt = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ aToken }) =>
      isAddressEqual(aToken.address, token));
    return receipt && !isAddressEqual(receipt.underlying.address, outputToken);
  }).length;
}

function outcome(input: LegacyBuildInput) {
  const amount = positive(input.inputAtomic, "Input");
  if (input.templateId === "aave-supply") {
    if (!Number.isInteger(input.exposureBps) || input.exposureBps < 1 || input.exposureBps > 10_000) {
      throw new Error("Protocol exposure must be between 1 and 10000 bps");
    }
    const minimum = amount * BigInt(input.exposureBps) / 10_000n * RECEIPT_FLOOR_BPS / 10_000n;
    if (minimum === 0n) throw new Error("Earn exposure is below one atomic unit");
    return { token: receiptToken(input.inputToken), atomic: minimum.toString() };
  }
  if (input.templateId === "exact-input-swap") {
    if (isAddressEqual(input.inputToken, input.outputToken)) throw new Error("Swap output must differ from input");
    return { token: input.outputToken.toLowerCase() as Address,
      atomic: positive(input.minimumOutputAtomic, "Minimum output").toString() };
  }
  if (input.templateId === "rwa-acquisition") {
    return { token: input.outputToken.toLowerCase() as Address,
      atomic: positive(input.minimumOutputAtomic, "Minimum output").toString() };
  }
  return { token: input.inputToken.toLowerCase() as Address,
    atomic: positive(input.minimumProfitAtomic, "Minimum profit").toString() };
}

export function buildOpenIntentPolicyV3(input: BuildInput): OpenIntentPolicyV3 {
  if (!input.displayGoal.trim()) throw new Error("Intent goal is required");
  if (!Number.isInteger(input.competitionDurationSec) || input.competitionDurationSec < 1 ||
    input.competitionDurationSec > MAX_COMPETITION_DURATION_SEC) {
    throw new Error("Competition duration must be between 1 and 900 seconds");
  }
  if (input.templateId === "staged-conversion") {
    const inputs = input.inputs.map((item) => ({ chainId: 196 as const,
      token: item.token.toLowerCase() as Address,
      maximumAtomic: positive(item.maximumAtomic, "Input").toString() }))
      .sort((left, right) => left.token.localeCompare(right.token));
    if (inputs.length < 1 || inputs.length > 8 ||
        new Set(inputs.map(({ token }) => token)).size !== inputs.length) {
      throw new Error("Staged conversion inputs must be unique");
    }
    const nativeValue = inputs.filter(({ token }) => isNativeAssetAddress(token))
      .reduce((sum, item) => sum + BigInt(item.maximumAtomic), 0n);
    const minimumStages = input.minimumStages ?? 1;
    if (!Number.isInteger(minimumStages) || minimumStages < 1 || minimumStages > 8) {
      throw new Error("Minimum stages must be between 1 and 8");
    }
    const stageLimit = Math.max(inputs.length + receiptExitStageCount(inputs, input.outputToken),
      minimumStages);
    return OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: input.requestId,
      displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
      executionChainIds: [196], nonce: input.nonce, createdAt: input.nowSec,
      deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
      competition: { closesAt: input.nowSec + input.competitionDurationSec,
        maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER },
      maxEvidenceAgeSec: 300, inputs,
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: input.outputToken.toLowerCase(),
        atomic: positive(input.minimumOutputAtomic, "Minimum output").toString() }],
      limits: { ...(minimumStages > 1 ? { minimumStages } : {}),
        maxStages: stageLimit, maxTransactions: stageLimit,
        maxApprovals: Math.max(inputs.filter(({ token }) => !isNativeAssetAddress(token)).length,
          minimumStages > 1 ? minimumStages : 0),
        maxCalldataBytes: 32_768, maxGasPerTransaction: "5000000",
        maxSolverFeeAtomic: input.maxSolverFeeAtomic,
        maxNativeValueAtomicByChain: [{ chainId: 196, atomic: nativeValue.toString() }] },
      forbiddenTargets: input.forbiddenTargets, forbiddenAssets: [],
    });
  }
  if (input.templateId === "rwa-acquisition") {
    if ("instrumentChainId" in input) {
      const chainIds = input.instrumentChainId === 196 ? [196] : [1, 196];
      return OpenIntentPolicyV3Schema.parse({
        version: 3, kind: "open-onchain", requestId: input.requestId,
        displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
        executionChainIds: chainIds, nonce: input.nonce, createdAt: input.nowSec,
        deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
        competition: { closesAt: input.nowSec + input.competitionDurationSec,
          maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER }, maxEvidenceAgeSec: 300,
        inputs: [{ chainId: input.instrumentChainId, token: input.inputToken.toLowerCase(),
          maximumAtomic: input.inputAtomic }],
        outcomes: [{ kind: "registered-instrument", chainId: input.instrumentChainId,
          token: input.outputToken.toLowerCase(), minimumIncreaseAtomic: input.minimumOutputAtomic,
          instrumentCommitment: input.instrumentCommitment, jurisdiction: input.jurisdiction,
          eligibilityAttested: true }],
        limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 32_768,
          maxGasPerTransaction: "5000000", maxSolverFeeAtomic: input.maxSolverFeeAtomic,
          maxNativeValueAtomicByChain: chainIds.map((chainId) => ({ chainId, atomic: "0" })) },
        forbiddenTargets: input.forbiddenTargets, forbiddenAssets: [],
      });
    }
    const chainIds = [...new Set([196, input.outputChainId])].sort((left, right) => left - right);
    const nativeInput = isNativeAssetAddress(input.inputToken);
    return OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: input.requestId,
      displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
      executionChainIds: chainIds, nonce: input.nonce, createdAt: input.nowSec,
      deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
      competition: { closesAt: input.nowSec + input.competitionDurationSec,
        maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER },
      maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: input.inputToken.toLowerCase(), maximumAtomic: input.inputAtomic }],
      outcomes: [{ kind: "minimum-increase", chainId: input.outputChainId,
        token: input.outputToken.toLowerCase(), atomic: input.minimumOutputAtomic }],
      limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 32_768,
        maxGasPerTransaction: "5000000", maxSolverFeeAtomic: input.maxSolverFeeAtomic,
        maxNativeValueAtomicByChain: chainIds.map((chainId) => ({ chainId,
          atomic: nativeInput && chainId === 196 ? input.inputAtomic : "0" })) },
      forbiddenTargets: input.forbiddenTargets, forbiddenAssets: [],
    });
  }
  const result = outcome(input);
  return OpenIntentPolicyV3Schema.parse({
    version: 3, kind: "open-onchain", requestId: input.requestId,
    displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
    executionChainIds: [196], nonce: input.nonce, createdAt: input.nowSec,
    deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
    competition: { closesAt: input.nowSec + input.competitionDurationSec,
      maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER },
    maxEvidenceAgeSec: 300,
    inputs: [{ chainId: 196, token: input.inputToken.toLowerCase(), maximumAtomic: input.inputAtomic }],
    outcomes: [{ kind: "minimum-increase", chainId: 196, token: result.token, atomic: result.atomic }],
    limits: { maxStages: 8, maxTransactions: 4, maxApprovals: 4, maxCalldataBytes: 16_384,
      maxGasPerTransaction: "5000000", maxSolverFeeAtomic: input.maxSolverFeeAtomic,
      maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
    forbiddenTargets: input.forbiddenTargets, forbiddenAssets: [],
  });
}
