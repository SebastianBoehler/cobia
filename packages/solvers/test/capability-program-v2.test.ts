import { describe, expect, it } from "vitest";
import {
  CapabilityProgramEvidenceV2Schema,
  CapabilityProgramV2Schema,
  capabilityProgramCommitmentV2,
  verifyCapabilityAssetFlowV2,
  type CompiledCapabilityActionV1,
} from "../src/index";

const owner = "0x1111111111111111111111111111111111111111";
const executor = "0x2222222222222222222222222222222222222222";
const inputToken = "0x3333333333333333333333333333333333333333";
const outputToken = "0x4444444444444444444444444444444444444444";
const target = "0x5555555555555555555555555555555555555555";
const runtimeCodeHash = `0x${"66".repeat(32)}` as `0x${string}`;
const blockHash = `0x${"77".repeat(32)}` as `0x${string}`;

const read = {
  target: outputToken,
  runtimeCodeHash,
  data: `0x70a08231${"0".repeat(24)}${owner.slice(2)}`,
  returnWordIndex: 0,
  decodeType: "uint256" as const,
  gasLimit: 50_000,
  label: "owner output balance",
};
const predicate = {
  ...read,
  phase: "after" as const,
  comparator: "gte" as const,
  bound: "9",
};
const program = {
  version: 2 as const,
  kind: "general-onchain" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440091",
  chainId: 196 as const,
  policyHash: `0x${"11".repeat(32)}`,
  manifestHash: `0x${"22".repeat(32)}`,
  owner,
  executor,
  pinnedBlock: { number: "123456", hash: blockHash },
  deadline: 2_000_000_000,
  nonce: `0x${"33".repeat(32)}`,
  input: { token: inputToken, atomic: "10" },
  actions: [{
    capabilityId: "protocol.deposit",
    capabilityVersion: 1,
    valueAtomic: "0" as const,
    parameters: { asset: inputToken, amountAtomic: "10" },
  }],
  balanceConstraints: [{
    kind: "minimumIncrease" as const,
    token: outputToken,
    atomic: "9",
  }],
  predicates: [predicate],
  objective: { kind: "maximize" as const, read },
};

const compiled = [{
  capabilityId: "protocol.deposit",
  capabilityVersion: 1,
  target,
  selector: "0x12345678",
  data: "0x12345678",
  spend: [{ token: inputToken, atomic: "10" }],
  guaranteedOutputs: [{ token: outputToken, account: owner, minimumIncreaseAtomic: "9" }],
  deployments: [{ address: target, runtimeCodeHash }],
  evidencePredicates: [],
}] satisfies CompiledCapabilityActionV1[];

describe("Capability Program V2", () => {
  it("accepts typed actions and commits every general outcome", () => {
    const parsed = CapabilityProgramV2Schema.parse(program);

    expect(parsed.actions[0]?.parameters).toEqual({ asset: inputToken, amountAtomic: "10" });
    expect(capabilityProgramCommitmentV2(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects raw write calldata, native value, zero input, and duplicate predicates", () => {
    expect(CapabilityProgramV2Schema.safeParse({
      ...program,
      actions: [{ ...program.actions[0], data: "0x12345678" }],
    }).success).toBe(false);
    expect(CapabilityProgramV2Schema.safeParse({
      ...program,
      actions: [{ ...program.actions[0], valueAtomic: "1" }],
    }).success).toBe(false);
    expect(CapabilityProgramV2Schema.safeParse({
      ...program,
      input: { ...program.input, atomic: "0" },
    }).success).toBe(false);
    expect(CapabilityProgramV2Schema.safeParse({
      ...program,
      predicates: [predicate, predicate],
    }).success).toBe(false);
  });

  it("proves conservative spend and minimum-increase flow", () => {
    expect(verifyCapabilityAssetFlowV2(
      CapabilityProgramV2Schema.parse(program),
      compiled,
    )).toMatchObject({ accepted: true });
    expect(verifyCapabilityAssetFlowV2(
      CapabilityProgramV2Schema.parse(program),
      [{ ...compiled[0], spend: [{ token: inputToken, atomic: "11" }] }],
    )).toMatchObject({ accepted: false, errorCodes: ["INSUFFICIENT_GUARANTEED_BALANCE"] });
  });

  it("requires simulation rather than inventing a static guarantee for absolute balances", () => {
    const absolute = CapabilityProgramV2Schema.parse({
      ...program,
      balanceConstraints: [{ kind: "minimumFinal", token: outputToken, atomic: "100" }],
    });
    expect(verifyCapabilityAssetFlowV2(absolute, compiled)).toMatchObject({ accepted: true });
  });

  it("binds exact static observations into evidence", () => {
    const programHash = capabilityProgramCommitmentV2(program);
    const evidence = CapabilityProgramEvidenceV2Schema.parse({
      version: 2,
      kind: "general-onchain",
      programHash,
      chainId: 196,
      blockNumber: program.pinnedBlock.number,
      blockHash,
      traceHash: `0x${"88".repeat(32)}`,
      stateDiffHash: `0x${"99".repeat(32)}`,
      eventsHash: `0x${"aa".repeat(32)}`,
      balanceDeltas: [{
        token: outputToken,
        account: owner,
        beforeAtomic: "0",
        afterAtomic: "9",
      }],
      deployments: [{ address: target, runtimeCodeHash }],
      observations: [{
        readHash: `0x${"bb".repeat(32)}`,
        phase: "after",
        returnData: `0x${"0".repeat(63)}9`,
        decodedValue: "9",
        satisfied: true,
      }],
      objective: {
        readHash: `0x${"cc".repeat(32)}`,
        returnData: `0x${"0".repeat(63)}9`,
        decodedValue: "9",
      },
    });
    expect(evidence.observations[0]?.decodedValue).toBe("9");
    expect(CapabilityProgramEvidenceV2Schema.safeParse({
      ...evidence,
      observations: [{ ...evidence.observations[0], returnData: "0x0" }],
    }).success).toBe(false);
  });
});
