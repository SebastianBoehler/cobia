import { commitment } from "@cobia/domain";
import { vi } from "vitest";
import {
  CapabilityProgramV2Schema,
  capabilityProgramCommitmentV2,
  createCapabilityRegistryV1,
  type CapabilityModuleV1,
  type CapabilityProgramEvidenceV2,
  type CapabilityProgramReplayResultV2,
  type StaticReadCallerV1,
} from "../src";

export const owner = "0x1111111111111111111111111111111111111111";
export const executor = "0x2222222222222222222222222222222222222222";
export const inputToken = "0x3333333333333333333333333333333333333333";
export const outputToken = "0x4444444444444444444444444444444444444444";
export const target = "0x5555555555555555555555555555555555555555";
export const sideToken = "0x7777777777777777777777777777777777777777";
export const targetCodeHash = `0x${"66".repeat(32)}` as `0x${string}`;
export const blockHash = `0x${"77".repeat(32)}` as `0x${string}`;
export const manifestHash = `0x${"22".repeat(32)}` as `0x${string}`;
export const read = {
  target: outputToken,
  runtimeCodeHash: `0x${"44".repeat(32)}` as `0x${string}`,
  data: `0x70a08231${"0".repeat(24)}${owner.slice(2)}` as `0x${string}`,
  returnWordIndex: 0,
  decodeType: "uint256" as const,
  gasLimit: 50_000,
  label: "owner output balance",
};
export const predicate = {
  ...read,
  phase: "after" as const,
  comparator: "gte" as const,
  bound: "9",
};

export const policy = {
  version: 2 as const,
  kind: "general-onchain" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440091",
  displayGoal: "Increase the verified output balance",
  owner,
  executionChainId: 196 as const,
  nonce: `0x${"33".repeat(32)}` as `0x${string}`,
  createdAt: 1_999_999_000,
  deadline: 2_000_000_000,
  competition: { closesAt: 1_999_999_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  manifestHash,
  input: { token: inputToken, maxAtomic: "10" },
  allowedCapabilities: [{ id: "protocol.deposit", version: 1 }],
  limits: {
    maxActions: 2,
    maxApprovals: 2,
    maxActionCalldataBytes: 1_024,
    maxExpectedGas: 500_000,
  },
  forbiddenTargets: ["0x9999999999999999999999999999999999999999"],
  forbiddenAssets: ["0x8888888888888888888888888888888888888888"],
  balanceConstraints: [{ kind: "minimumIncrease" as const, token: outputToken, atomic: "9" }],
  predicates: [predicate],
  objective: { kind: "maximize" as const, read },
};

export const snapshot = {
  version: 1 as const,
  kind: "general-onchain" as const,
  requestId: policy.requestId,
  chainId: 196 as const,
  blockNumber: "123456",
  blockHash,
  capturedAt: "2033-05-18T03:31:30.000Z",
  manifestHash,
};

export const module: CapabilityModuleV1<{ amountAtomic: string }> = {
  id: "protocol.deposit",
  version: 1,
  parseParameters(value) {
    if (!value || typeof value !== "object" || !("amountAtomic" in value) ||
      typeof value.amountAtomic !== "string") throw new Error("invalid amount");
    return { amountAtomic: value.amountAtomic };
  },
  compile({ program, parameters }) {
    return {
      capabilityId: "protocol.deposit",
      capabilityVersion: 1,
      target,
      selector: "0x12345678",
      data: "0x12345678",
      expectedGas: 200_000,
      spend: [{ token: inputToken, atomic: parameters.amountAtomic }],
      guaranteedOutputs: [{
        token: outputToken,
        account: program.owner,
        minimumIncreaseAtomic: "9",
      }, { token: sideToken, account: program.owner, minimumIncreaseAtomic: "1" }],
      deployments: [{ address: target, runtimeCodeHash: targetCodeHash }],
      evidencePredicates: [],
    };
  },
  verifyEvidence: () => [],
};
export const registry = createCapabilityRegistryV1([module]);

export function program() {
  return CapabilityProgramV2Schema.parse({
    version: 2,
    kind: "general-onchain",
    requestId: policy.requestId,
    chainId: 196,
    policyHash: commitment(policy),
    manifestHash,
    owner,
    executor,
    pinnedBlock: { number: snapshot.blockNumber, hash: blockHash },
    deadline: policy.deadline,
    nonce: policy.nonce,
    input: { token: inputToken, atomic: "10" },
    actions: [{
      capabilityId: module.id,
      capabilityVersion: module.version,
      valueAtomic: "0",
      parameters: { amountAtomic: "10" },
    }],
    balanceConstraints: policy.balanceConstraints,
    predicates: policy.predicates,
    objective: policy.objective,
  });
}

const wordNine = `0x${"0".repeat(63)}9` as `0x${string}`;
export function evidence(candidate = program()): CapabilityProgramEvidenceV2 {
  return {
    version: 2,
    kind: "general-onchain",
    programHash: capabilityProgramCommitmentV2(candidate),
    chainId: 196,
    blockNumber: snapshot.blockNumber,
    blockHash,
    traceHash: `0x${"88".repeat(32)}`,
    stateDiffHash: `0x${"99".repeat(32)}`,
    eventsHash: `0x${"aa".repeat(32)}`,
    balanceDeltas: [{ token: outputToken, account: owner, beforeAtomic: "0", afterAtomic: "9" }],
    deployments: [
      { address: target, runtimeCodeHash: targetCodeHash },
      { address: outputToken, runtimeCodeHash: read.runtimeCodeHash },
    ],
    observations: [{
      readHash: commitment(read), phase: "after", returnData: wordNine,
      decodedValue: "9", satisfied: true,
    }],
    objective: { readHash: commitment(read), returnData: wordNine, decodedValue: "9" },
  };
}

export function replay(candidate = program()) {
  const observed = evidence(candidate);
  return vi.fn(async (): Promise<CapabilityProgramReplayResultV2> => ({
    reproduced: true,
    traceHash: observed.traceHash,
    stateDiffHash: observed.stateDiffHash,
    eventsHash: observed.eventsHash,
    balanceDeltas: observed.balanceDeltas,
    deployments: observed.deployments,
    observations: observed.observations,
    objective: observed.objective,
  }));
}

export const staticCaller: StaticReadCallerV1 = {
  getCodeHash: vi.fn(async (address) =>
    address.toLowerCase() === target.toLowerCase() ? targetCodeHash : read.runtimeCodeHash),
  call: vi.fn(async () => ({ success: true, returnData: wordNine })),
};
