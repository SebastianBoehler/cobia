import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import {
  CapabilityProgramV1Schema,
  capabilityProgramCommitmentV1,
  createCapabilityRegistryV1,
  verifyCapabilityProgramV1,
  type CapabilityProgramEvidenceV1,
  type CapabilityReplayResultV1,
  type CapabilityModuleV1,
} from "../src";
import {
  routeInputAsset,
  routeOutputAsset,
  routePolicy,
  routeRegistryHash,
  routeSnapshot,
} from "./routing-v2-fixtures";

const executor = "0x4444444444444444444444444444444444444444";
const target = "0x5555555555555555555555555555555555555555";
const targetCodeHash = `0x${"66".repeat(32)}` as const;

const module: CapabilityModuleV1<{ amountAtomic: string }> = {
  id: "position.example.supply",
  version: 1,
  parseParameters(input) {
    if (typeof input !== "object" || !input || !("amountAtomic" in input) ||
      typeof input.amountAtomic !== "string") throw new Error("Invalid amount");
    return { amountAtomic: input.amountAtomic };
  },
  compile({ program, parameters }) {
    return {
      capabilityId: "position.example.supply",
      capabilityVersion: 1,
      target,
      selector: "0x12345678",
      data: "0x12345678",
      expectedGas: 200_000,
      spend: [{ token: routeInputAsset, atomic: parameters.amountAtomic }],
      guaranteedOutputs: [{
        token: routeOutputAsset,
        account: program.owner,
        minimumIncreaseAtomic: "49999999",
      }],
      deployments: [{ address: target, runtimeCodeHash: targetCodeHash }],
      evidencePredicates: [{ kind: "position-issued", owner: program.owner }],
    };
  },
  verifyEvidence: () => [],
};
const registry = createCapabilityRegistryV1([module]);

function program() {
  return CapabilityProgramV1Schema.parse({
    version: 1,
    requestId: routePolicy.requestId,
    chainId: 196,
    policyHash: commitment(routePolicy),
    manifestHash: routeRegistryHash,
    owner: routePolicy.owner,
    executor,
    pinnedBlock: { number: routeSnapshot.blockNumber, hash: routeSnapshot.blockHash },
    deadline: routePolicy.deadline,
    nonce: `0x${"77".repeat(32)}`,
    input: { token: routeInputAsset, atomic: "50000000" },
    actions: [{
      capabilityId: module.id,
      capabilityVersion: module.version,
      valueAtomic: "0",
      parameters: { amountAtomic: "50000000" },
    }],
    constraints: [{
      token: routeOutputAsset,
      account: routePolicy.owner,
      minimumIncreaseAtomic: "49999999",
    }],
  });
}

function evidence(candidate = program()): CapabilityProgramEvidenceV1 {
  return {
    version: 1 as const,
    programHash: capabilityProgramCommitmentV1(candidate),
    chainId: 196 as const,
    blockNumber: routeSnapshot.blockNumber,
    blockHash: routeSnapshot.blockHash,
    traceHash: `0x${"88".repeat(32)}` as const,
    stateDiffHash: `0x${"99".repeat(32)}` as const,
    eventsHash: `0x${"aa".repeat(32)}` as const,
    balanceDeltas: [{
      token: routeOutputAsset,
      account: routePolicy.owner,
      beforeAtomic: "0",
      afterAtomic: "49999999",
    }],
    deployments: [{ address: target, runtimeCodeHash: targetCodeHash }],
  };
}

function replay(candidate = program()) {
  const observed = evidence(candidate);
  return vi.fn(async (): Promise<CapabilityReplayResultV1> => ({
    reproduced: true,
    traceHash: observed.traceHash,
    stateDiffHash: observed.stateDiffHash,
    eventsHash: observed.eventsHash,
    balanceDeltas: observed.balanceDeltas,
    deployments: observed.deployments,
  }));
}

function verify(input: Partial<Parameters<typeof verifyCapabilityProgramV1>[0]> = {}) {
  const candidate = input.program ?? program();
  return verifyCapabilityProgramV1({
    policy: routePolicy,
    wallet: routePolicy.owner,
    snapshot: routeSnapshot,
    manifest: { registryHash: routeRegistryHash },
    program: candidate,
    evidence: input.evidence ?? evidence(candidate as ReturnType<typeof program>),
    registry: input.registry ?? registry,
    nowSec: Math.floor(Date.parse(routeSnapshot.capturedAt) / 1_000) + 60,
    replay: input.replay ?? replay(candidate as ReturnType<typeof program>),
  });
}

describe("generic capability verifier", () => {
  it("accepts a compiled program only after exact independent replay", async () => {
    const reproduce = replay();
    const result = await verify({ replay: reproduce });

    expect(result.accepted).toBe(true);
    expect(result.errorCodes).toEqual([]);
    expect(result.compiled).toHaveLength(1);
    expect(result.replay).toMatchObject({ reproduced: true });
    expect(reproduce).toHaveBeenCalledOnce();
  });

  it("rejects an unknown capability without replay", async () => {
    const candidate = program();
    candidate.actions[0] = { ...candidate.actions[0]!, capabilityId: "unknown.protocol.call" };
    const reproduce = replay(candidate);
    const result = await verify({
      program: candidate,
      evidence: evidence(candidate),
      replay: reproduce,
    });

    expect(result.errorCodes).toEqual(["UNSUPPORTED_CAPABILITY"]);
    expect(reproduce).not.toHaveBeenCalled();
  });

  it("rejects a module outside the signed policy capability set", async () => {
    const denied: CapabilityModuleV1<{ amountAtomic: string }> = {
      ...module,
      id: "position.denied.supply",
      policyAdapterId: "curve-stableswap-ng@1",
      compile(input) {
        return { ...module.compile(input), capabilityId: "position.denied.supply" };
      },
    };
    const candidate = program();
    candidate.actions[0] = { ...candidate.actions[0]!, capabilityId: denied.id };
    const reproduce = replay(candidate);
    const result = await verify({
      program: candidate,
      evidence: evidence(candidate),
      registry: createCapabilityRegistryV1([denied]),
      replay: reproduce,
    });

    expect(result.errorCodes).toEqual(["CAPABILITY_NOT_ALLOWED"]);
    expect(reproduce).not.toHaveBeenCalled();
  });

  it("rejects raw-call shaped output at the schema boundary", async () => {
    const candidate = { ...program(), actions: undefined, calls: [{ to: target, data: "0x12345678" }] };
    const result = await verifyCapabilityProgramV1({
      policy: routePolicy,
      wallet: routePolicy.owner,
      snapshot: routeSnapshot,
      manifest: { registryHash: routeRegistryHash },
      program: candidate,
      evidence: evidence(),
      registry,
      nowSec: Math.floor(Date.parse(routeSnapshot.capturedAt) / 1_000) + 60,
      replay: replay(),
    });
    expect(result.errorCodes).toEqual(["PROGRAM_SCHEMA_INVALID"]);
  });

  it("rejects changed deployment evidence before replay", async () => {
    const changed = evidence();
    changed.deployments[0] = { ...changed.deployments[0]!, runtimeCodeHash: `0x${"bb".repeat(32)}` };
    const reproduce = replay();
    const result = await verify({ evidence: changed, replay: reproduce });

    expect(result.errorCodes).toEqual(["TARGET_CODE_MISMATCH"]);
    expect(reproduce).not.toHaveBeenCalled();
  });

  it("rejects a fresh replay with a different event commitment", async () => {
    const result = await verify({ replay: async () => ({
      ...await replay()(),
      eventsHash: `0x${"cc".repeat(32)}`,
    }) });
    expect(result.errorCodes).toEqual(["REPLAY_MISMATCH"]);
  });
});
