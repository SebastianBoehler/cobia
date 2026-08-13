import { describe, expect, it } from "vitest";
import {
  CapabilityProgramV1Schema,
  capabilityProgramCommitmentV1,
  createCapabilityRegistryV1,
  type CapabilityModuleV1,
} from "../src";

const program = {
  version: 1,
  requestId: "b1946b6f-aad8-45a6-96dd-d138b55c7710",
  chainId: 196,
  policyHash: `0x${"11".repeat(32)}`,
  manifestHash: `0x${"22".repeat(32)}`,
  owner: "0x1111111111111111111111111111111111111111",
  executor: "0x2222222222222222222222222222222222222222",
  pinnedBlock: { number: "123456", hash: `0x${"33".repeat(32)}` },
  deadline: 2_000_000_000,
  nonce: `0x${"44".repeat(32)}`,
  input: {
    token: "0x3333333333333333333333333333333333333333",
    atomic: "10000000",
  },
  actions: [{
    capabilityId: "research.protocol.action",
    capabilityVersion: 7,
    valueAtomic: "0",
    parameters: { amountAtomic: "10000000", nested: [true, null, 3] },
  }],
  constraints: [{
    token: "0x4444444444444444444444444444444444444444",
    account: "0x1111111111111111111111111111111111111111",
    minimumIncreaseAtomic: "1",
  }],
} as const;

function module(id: string, version: number): CapabilityModuleV1<unknown> {
  return {
    id,
    version,
    parseParameters: (input) => input,
    compile: () => ({
      capabilityId: id,
      capabilityVersion: version,
      target: "0x5555555555555555555555555555555555555555",
      selector: "0x12345678",
      data: "0x12345678",
      spend: [],
      guaranteedOutputs: [],
      deployments: [],
      evidencePredicates: [],
    }),
    verifyEvidence: () => [],
  };
}

describe("open capability program", () => {
  it("accepts an unknown capability structurally and commits deterministically", () => {
    const parsed = CapabilityProgramV1Schema.parse(program);
    expect(parsed.actions[0]?.capabilityId).toBe("research.protocol.action");
    expect(capabilityProgramCommitmentV1(program)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(capabilityProgramCommitmentV1(structuredClone(program))).toBe(
      capabilityProgramCommitmentV1(program),
    );
  });

  it.each([
    ["native value", { ...program, actions: [{ ...program.actions[0], valueAtomic: "1" }] }],
    ["fractional parameter", {
      ...program,
      actions: [{ ...program.actions[0], parameters: { ratio: 1.5 } }],
    }],
    ["unsafe integer parameter", {
      ...program,
      actions: [{ ...program.actions[0], parameters: { count: Number.MAX_SAFE_INTEGER + 1 } }],
    }],
    ["too many actions", { ...program, actions: Array(9).fill(program.actions[0]) }],
  ])("rejects %s before module resolution", (_label, candidate) => {
    expect(() => CapabilityProgramV1Schema.parse(candidate)).toThrow();
  });
});

describe("capability registry", () => {
  it("resolves only the exact capability id and version", () => {
    const v1 = module("swap.example", 1);
    const v2 = module("swap.example", 2);
    const registry = createCapabilityRegistryV1([v1, v2]);

    expect(registry.resolve("swap.example", 2)).toBe(v2);
    expect(() => registry.resolve("swap.example", 3)).toThrow("Unsupported capability");
    expect(() => registry.resolve("SWAP.EXAMPLE", 1)).toThrow("Unsupported capability");
  });

  it("rejects duplicate module keys", () => {
    expect(() => createCapabilityRegistryV1([
      module("swap.example", 1),
      module("swap.example", 1),
    ])).toThrow("Duplicate capability module");
  });
});
