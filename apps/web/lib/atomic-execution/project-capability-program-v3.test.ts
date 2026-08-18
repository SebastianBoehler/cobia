import { commitment } from "@cobia/domain";
import {
  CapabilityProgramEvidenceV2Schema,
  CapabilityProgramV2Schema,
  capabilityProgramCommitmentV2,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { projectCapabilityProgramV3 } from "./project-capability-program-v3";

const owner = "0x1111111111111111111111111111111111111111";
const executor = "0x2222222222222222222222222222222222222222";
const input = "0x3333333333333333333333333333333333333333";
const output = "0x4444444444444444444444444444444444444444";
const target = "0x5555555555555555555555555555555555555555";
const runtimeCodeHash = `0x${"66".repeat(32)}` as const;
const read = {
  target: output, runtimeCodeHash, data: `0x70a08231${"0".repeat(24)}${owner.slice(2)}`,
  returnWordIndex: 0, decodeType: "uint256" as const, gasLimit: 50_000, label: "output",
};
const predicate = { ...read, phase: "after" as const, comparator: "gte" as const, bound: "9" };
const program = CapabilityProgramV2Schema.parse({
  version: 2, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440091",
  chainId: 196, policyHash: `0x${"11".repeat(32)}`, manifestHash: `0x${"22".repeat(32)}`,
  owner, executor, pinnedBlock: { number: "123", hash: `0x${"77".repeat(32)}` },
  deadline: 2_000_000_000, nonce: `0x${"33".repeat(32)}`, input: { token: input, atomic: "10" },
  actions: [{ capabilityId: "protocol.deposit", capabilityVersion: 1, valueAtomic: "0", parameters: {} }],
  balanceConstraints: [
    { kind: "minimumIncrease", token: output, atomic: "9" },
    { kind: "minimumFinal", token: input, atomic: "1" },
  ],
  predicates: [predicate], objective: { kind: "maximize", read },
});
const evidence = CapabilityProgramEvidenceV2Schema.parse({
  version: 2, kind: "general-onchain", programHash: capabilityProgramCommitmentV2(program), chainId: 196,
  blockNumber: "123", blockHash: program.pinnedBlock.hash, traceHash: `0x${"88".repeat(32)}`,
  stateDiffHash: `0x${"99".repeat(32)}`, eventsHash: `0x${"aa".repeat(32)}`,
  balanceDeltas: [], deployments: [], observations: [],
});
const compiled: CompiledCapabilityActionV1[] = [{
  capabilityId: "protocol.deposit", capabilityVersion: 1, target,
  selector: "0x12345678", data: "0x12345678", expectedGas: 200_000,
  spend: [{ token: input, atomic: "10" }],
  guaranteedOutputs: [{ token: output, account: owner, minimumIncreaseAtomic: "9" }],
  deployments: [], evidencePredicates: [],
}];

describe("general capability atomic projection", () => {
  it("projects exact enums, bounds, reads, refunds, and evidence commitments", () => {
    const projected = projectCapabilityProgramV3({
      program, evidence, verification: { accepted: true, errorCodes: [], compiled, replay: {} },
    });
    expect(projected).toMatchObject({
      canonicalProgramHash: capabilityProgramCommitmentV2(program),
      simulationHash: commitment(evidence), owner, inputToken: input,
      constraints: [{ kind: 1, minimum: 9n }, { kind: 0, minimum: 1n }],
      predicates: [{ phase: 1, comparator: 1, bound: `0x${"0".repeat(63)}9` }],
    });
    expect(projected.refundTokens.map((value) => value.toLowerCase()))
      .toEqual([input, output]);
    expect(projected.predicates[0]?.read).not.toHaveProperty("label");
  });

  it("rejects unverified, unreplayed, partial, or tampered projection inputs", () => {
    const base = { program, evidence, verification: { accepted: true, errorCodes: [], compiled, replay: {} } };
    expect(() => projectCapabilityProgramV3({ ...base, verification: { ...base.verification, accepted: false } })).toThrow(/accepted/i);
    expect(() => projectCapabilityProgramV3({ ...base, verification: { ...base.verification, replay: undefined } })).toThrow(/replay/i);
    expect(() => projectCapabilityProgramV3({ ...base, verification: { ...base.verification, compiled: [] } })).toThrow(/every/i);
    expect(() => projectCapabilityProgramV3({ ...base, evidence: { ...evidence, programHash: `0x${"ff".repeat(32)}` } })).toThrow(/bind/i);
  });
});
