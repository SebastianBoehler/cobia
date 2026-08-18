import {
  CapabilityProgramV1Schema,
  capabilityProgramCommitmentV1,
  type CapabilityProgramEvidenceV1,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import { commitment } from "@cobia/domain";
import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { projectCapabilityProgramV2 } from "./project-capability-program";
import { atomicExecutionProgramHashV2 } from "./types-v2";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const input = "0x3333333333333333333333333333333333333333" as const;
const middle = "0x4444444444444444444444444444444444444444" as const;
const output = "0x5555555555555555555555555555555555555555" as const;
const firstTarget = "0x6666666666666666666666666666666666666666" as const;
const secondTarget = "0x7777777777777777777777777777777777777777" as const;
const blockHash = `0x${"88".repeat(32)}` as const;

function fixture() {
  const program = CapabilityProgramV1Schema.parse({
    version: 1,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    chainId: 196,
    policyHash: `0x${"11".repeat(32)}`,
    manifestHash: `0x${"22".repeat(32)}`,
    owner,
    executor,
    pinnedBlock: { number: "123456", hash: blockHash },
    deadline: 1_800_000_000,
    nonce: `0x${"33".repeat(32)}`,
    input: { token: input, atomic: "10000000" },
    actions: [
      { capabilityId: "protocol.swap", capabilityVersion: 2, valueAtomic: "0", parameters: {} },
      { capabilityId: "protocol.deposit", capabilityVersion: 7, valueAtomic: "0", parameters: {} },
    ],
    constraints: [{ token: output, account: owner, minimumIncreaseAtomic: "9900000" }],
  });
  const compiled: CompiledCapabilityActionV1[] = [
    {
      capabilityId: "protocol.swap",
      capabilityVersion: 2,
      target: firstTarget,
      selector: "0x12345678",
      data: "0x12345678",
      expectedGas: 100_000,
      spend: [{ token: input, atomic: "10000000" }],
      guaranteedOutputs: [{ token: middle, account: executor, minimumIncreaseAtomic: "9900000" }],
      deployments: [],
      evidencePredicates: [],
    },
    {
      capabilityId: "protocol.deposit",
      capabilityVersion: 7,
      target: secondTarget,
      selector: "0x87654321",
      data: "0x87654321",
      expectedGas: 100_000,
      spend: [{ token: middle, atomic: "9900000" }],
      guaranteedOutputs: [{ token: output, account: owner, minimumIncreaseAtomic: "9900000" }],
      deployments: [],
      evidencePredicates: [],
    },
  ];
  const evidence: CapabilityProgramEvidenceV1 = {
    version: 1,
    programHash: capabilityProgramCommitmentV1(program),
    chainId: 196,
    blockNumber: "123456",
    blockHash,
    traceHash: `0x${"44".repeat(32)}`,
    stateDiffHash: `0x${"55".repeat(32)}`,
    eventsHash: `0x${"66".repeat(32)}`,
    balanceDeltas: [],
    deployments: [],
  };
  return {
    program,
    evidence,
    verification: { accepted: true as boolean, errorCodes: [] as string[], compiled },
  };
}

describe("capability program V2 projection", () => {
  it("projects an open capability sequence into the exact bounded executor IR", () => {
    const source = fixture();
    const value = projectCapabilityProgramV2(source);

    expect(value.canonicalProgramHash).toBe(capabilityProgramCommitmentV1(source.program));
    expect(value.simulationHash).toBe(commitment(source.evidence));
    expect(value.actions.map((action) => action.capabilityKey)).toEqual([
      keccak256(toBytes("protocol.swap@2")),
      keccak256(toBytes("protocol.deposit@7")),
    ]);
    expect(value.actions[0]?.approvals).toEqual([{ token: input, amount: 10_000_000n }]);
    expect(value.refundTokens).toEqual([input, middle, output]);
    expect(value.constraints).toEqual([{ token: output, minimumIncrease: 9_900_000n }]);
    expect(atomicExecutionProgramHashV2(value)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects anything that is not an independently accepted exact compilation", () => {
    const rejected = fixture();
    rejected.verification.accepted = false;
    rejected.verification.errorCodes = ["REPLAY_MISMATCH"];
    expect(() => projectCapabilityProgramV2(rejected)).toThrow("accepted verification");

    const changed = fixture();
    changed.verification.compiled[0] = {
      ...changed.verification.compiled[0]!,
      selector: "0xdeadbeef",
    };
    expect(() => projectCapabilityProgramV2(changed)).toThrow("selector");

    const wrongOwner = fixture();
    wrongOwner.program.constraints[0]!.account = executor;
    wrongOwner.evidence.programHash = capabilityProgramCommitmentV1(wrongOwner.program);
    expect(() => projectCapabilityProgramV2(wrongOwner)).toThrow("owner constraints");
  });
});
