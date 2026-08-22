import {
  CapabilityCompositionPolicyV1Schema,
  commitment,
  type CapabilityCompositionPolicyV1,
} from "@cobia/domain";
import type { Address, Hash } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";

interface BuildCompositionPolicyInput {
  requestId: string;
  owner: Address;
  inputToken: Address;
  inputAtomic: string;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  competitionDurationSec: number;
  deadlineDurationSec: number;
  maxConversionLossBps: number;
  minimumReceiptValueBps: number;
  terminalAsset?: Address;
  horizonDays: number;
  forbiddenTargets: Address[];
}

const RECEIPT_CAPABILITIES = ["aave-v3.supply@1"] as const;

export function buildCapabilityCompositionPolicyV1(
  input: BuildCompositionPolicyInput,
): CapabilityCompositionPolicyV1 {
  if (!Number.isInteger(input.competitionDurationSec) ||
      input.competitionDurationSec < 1 || input.competitionDurationSec > 900 ||
      !Number.isInteger(input.deadlineDurationSec) ||
      input.deadlineDurationSec < input.competitionDurationSec ||
      input.deadlineDurationSec > 1_800) {
    throw new Error("Competition and execution deadline bounds are invalid");
  }
  const manifest = productionCapabilityManifestV1();
  const allowedCapabilities = manifest.capabilities
    .map(({ id, version }) => ({ id, version }))
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(
      `${right.id}@${right.version}`,
    ));
  const allowedAssets = Object.values(PROTOCOL_REGISTRY.aaveV3.assets)
    .map(({ underlying }) => underlying.address.toLowerCase() as Address)
    .sort();
  return CapabilityCompositionPolicyV1Schema.parse({
    version: 1,
    kind: "capability-composition",
    requestId: input.requestId,
    displayGoal: input.displayGoal,
    owner: input.owner,
    executionChainId: 196,
    nonce: input.nonce,
    createdAt: input.nowSec,
    deadline: input.nowSec + input.deadlineDurationSec,
    competition: {
      closesAt: input.nowSec + input.competitionDurationSec,
      maxRevisionsPerSolver: 5,
    },
    maxEvidenceAgeSec: Math.min(300, input.competitionDurationSec),
    manifestHash: commitment(manifest),
    input: { token: input.inputToken, maxAtomic: input.inputAtomic },
    allowedAssets,
    allowedCapabilities,
    constraints: [{
      kind: "maximum-conversion-loss",
      maximumLossBps: input.maxConversionLossBps,
    }, {
      kind: "minimum-registered-receipt-value",
      minimumValueBps: input.minimumReceiptValueBps,
      receiptCapabilities: [...RECEIPT_CAPABILITIES],
    }, ...(input.terminalAsset ? [{
      kind: "required-terminal-asset" as const,
      asset: input.terminalAsset.toLowerCase() as Address,
    }] : [])],
    objective: {
      kind: "maximize-net-yield",
      horizonDays: input.horizonDays,
      receiptCapabilities: [...RECEIPT_CAPABILITIES],
    },
    limits: {
      maxActions: 8,
      maxApprovals: 8,
      maxActionCalldataBytes: 16_384,
      maxExpectedGas: 5_000_000,
      maxSolverFeeAtomic: "0",
    },
    forbiddenTargets: [...input.forbiddenTargets]
      .map((target) => target.toLowerCase() as Address).sort(),
    forbiddenAssets: [],
  });
}
