import { GeneralIntentPolicyV2Schema, type GeneralIntentPolicyV2 } from "@cobia/domain";
import { isAddressEqual, type Address, type Hash } from "viem";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";

const DEADLINE_LIFETIME_SEC = 30 * 60;
const MAX_EVIDENCE_AGE_SEC = 300;
const MAX_COMPETITION_DURATION_SEC = 15 * 60;
const MAX_REVISIONS_PER_SOLVER = 5;
const RECEIPT_FLOOR_BPS = 9_950n;

interface CommonInput {
  requestId: string;
  owner: Address;
  inputToken: Address;
  inputAtomic: string;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  competitionDurationSec: number;
}

type BuildInput = CommonInput & (
  | { templateId: "aave-supply"; exposureBps: number }
  | { templateId: "exact-input-swap"; outputToken: Address; minimumOutputAtomic: string }
  | { templateId: "round-trip"; minimumProfitAtomic: string }
);

function positive(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive atomic amount`);
  return BigInt(value);
}

function receiptToken(inputToken: Address): Address {
  const entry = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, inputToken));
  if (!entry) throw new Error("Earn input is not registered for Aave supply");
  return entry.aToken.address;
}

function outcome(input: BuildInput) {
  const amount = positive(input.inputAtomic, "Input");
  if (input.templateId === "aave-supply") {
    if (!Number.isInteger(input.exposureBps) || input.exposureBps < 1 || input.exposureBps > 10_000) {
      throw new Error("Protocol exposure must be between 1 and 10000 bps");
    }
    const exposed = amount * BigInt(input.exposureBps) / 10_000n;
    const minimumReceipt = exposed * RECEIPT_FLOOR_BPS / 10_000n;
    if (minimumReceipt === 0n) throw new Error("Earn exposure is below one atomic unit");
    return {
      capabilities: [{ id: "aave-v3.supply", version: 1 }] as const,
      constraints: [{
        kind: "minimumIncrease" as const,
        token: receiptToken(input.inputToken),
        atomic: minimumReceipt.toString(),
      }],
      maxActions: 1,
    };
  }
  if (input.templateId === "exact-input-swap") {
    if (isAddressEqual(input.inputToken, input.outputToken)) {
      throw new Error("Swap output must use a different asset");
    }
    return {
      capabilities: [
        { id: "curve-stableswap-ng.exact-input", version: 1 },
        { id: "uniswap-v3.exact-input", version: 1 },
      ] as const,
      constraints: [{
        kind: "minimumIncrease" as const,
        token: input.outputToken,
        atomic: positive(input.minimumOutputAtomic, "Minimum output").toString(),
      }],
      maxActions: 1,
    };
  }
  return {
    capabilities: [
      { id: "curve-stableswap-ng.exact-input", version: 1 },
      { id: "uniswap-v3.exact-input", version: 1 },
    ] as const,
    constraints: [{
      kind: "minimumIncrease" as const,
      token: input.inputToken,
      atomic: positive(input.minimumProfitAtomic, "Minimum profit").toString(),
    }],
    maxActions: 2,
  };
}

export function buildGeneralIntentPolicyV2(input: BuildInput): GeneralIntentPolicyV2 {
  if (!input.displayGoal.trim()) throw new Error("Intent goal is required");
  if (!Number.isInteger(input.competitionDurationSec) || input.competitionDurationSec < 1 ||
    input.competitionDurationSec > MAX_COMPETITION_DURATION_SEC) {
    throw new Error("Competition duration must be between 1 and 900 seconds");
  }
  const result = outcome(input);
  return GeneralIntentPolicyV2Schema.parse({
    version: 2,
    kind: "general-onchain",
    requestId: input.requestId,
    displayGoal: input.displayGoal,
    owner: input.owner,
    executionChainId: 196,
    nonce: input.nonce,
    createdAt: input.nowSec,
    deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
    competition: {
      closesAt: input.nowSec + input.competitionDurationSec,
      maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER,
    },
    maxEvidenceAgeSec: MAX_EVIDENCE_AGE_SEC,
    manifestHash: registryHash,
    input: { token: input.inputToken, maxAtomic: input.inputAtomic },
    allowedCapabilities: result.capabilities,
    limits: {
      maxActions: result.maxActions,
      maxApprovals: result.maxActions,
      maxActionCalldataBytes: 4_096,
      maxExpectedGas: 2_000_000,
    },
    forbiddenTargets: [],
    forbiddenAssets: [],
    balanceConstraints: result.constraints,
    predicates: [],
    objective: { kind: "satisfy" },
  });
}
