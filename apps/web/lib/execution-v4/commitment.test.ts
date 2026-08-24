import { describe, expect, it } from "vitest";
import {
  authorizationPayloadHashV4,
  buildAuthorizationV4,
  executionProgramHashV4,
  type ExecutionProgramV4,
} from "./commitment";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const executor = "0x5555555555555555555555555555555555555555" as const;
const alternateOutput = "0x6666666666666666666666666666666666666666" as const;
const spender = "0x7777777777777777777777777777777777777777" as const;

function program(): ExecutionProgramV4 {
  return {
    policyHash: hash("1"),
    manifestHash: hash("2"),
    canonicalProgramHash: hash("3"),
    inputIdentityEvidenceHash: hash("4"),
    outputIdentityEvidenceHash: hash("5"),
    valuationEvidenceHash: hash("6"),
    stageHash: hash("7"),
    simulationHash: hash("8"),
    pinnedBlockNumber: 12_345n,
    pinnedBlockHash: hash("9"),
    sourceChainId: 196n,
    owner,
    inputToken,
    outputToken,
    inputAmount: 1_000_000n,
    inputUsdE8: 100_000_000n,
    deadline: 1_900_000_000n,
    nonce: hash("a"),
    refundTokens: [inputToken, outputToken],
    calls: [{
      adapterKey: hash("b"),
      target,
      targetRuntimeCodeHash: hash("c"),
      value: 123n,
      gasLimit: 300_000,
      approvals: [{ token: inputToken, spender, amount: 1_000_000n }],
      data: "0x12345678",
    }],
    constraints: [{ token: outputToken, kind: 1, minimum: 990_000n }],
  };
}

describe("ExecutorV4 commitments", () => {
  it("matches frozen Solidity ABI hashes", () => {
    const value = program();
    const authorization = buildAuthorizationV4(value, executor);

    expect(executionProgramHashV4(value)).toBe("0x8ae1af7da9ef344cd290d9146688153235392fc642d18f7ba7f6e283a1e5935f");
    expect(authorizationPayloadHashV4(authorization)).toBe("0xe1eab017f801b03271b1b7a40b3b2914ebe97ee4d80cf6b8fcc9f81322d07d61");
  });

  it("binds every program field including USD, gas, native value, and exact assets", () => {
    const value = program();
    const baseline = executionProgramHashV4(value);
    const mutations: ExecutionProgramV4[] = [
      {
        ...value,
        outputToken: alternateOutput,
        refundTokens: [inputToken, alternateOutput],
        constraints: [{ ...value.constraints[0]!, token: alternateOutput }],
      },
      { ...value, inputUsdE8: value.inputUsdE8 + 1n },
      { ...value, stageHash: hash("c") },
      { ...value, calls: [{ ...value.calls[0]!, adapterKey: hash("c") }] },
      { ...value, calls: [{ ...value.calls[0]!, target: owner }] },
      { ...value, calls: [{ ...value.calls[0]!, targetRuntimeCodeHash: hash("d") }] },
      { ...value, calls: [{ ...value.calls[0]!, data: "0xdeadbeef" }] },
      { ...value, calls: [{ ...value.calls[0]!, value: 124n }] },
      { ...value, calls: [{ ...value.calls[0]!, gasLimit: 300_001 }] },
      { ...value, calls: [{ ...value.calls[0]!, approvals: [{
        ...value.calls[0]!.approvals[0]!, spender: owner,
      }] }] },
      { ...value, constraints: [{ ...value.constraints[0]!, minimum: 989_999n }] },
    ];
    for (const changed of mutations) expect(executionProgramHashV4(changed)).not.toBe(baseline);

    const ordered = {
      ...value,
      calls: [value.calls[0]!, { ...value.calls[0]!, data: "0xdeadbeef" as const }],
    };
    expect(executionProgramHashV4({ ...ordered, calls: [...ordered.calls].reverse() }))
      .not.toBe(executionProgramHashV4(ordered));
  });

  it("rejects malformed or over-broad programs before hashing", () => {
    expect(() => executionProgramHashV4({ ...program(), calls: [] })).toThrow();
    expect(() => executionProgramHashV4({ ...program(), sourceChainId: 8453n })).toThrow();
    expect(() => executionProgramHashV4({ ...program(), inputUsdE8: 0n })).toThrow();
    expect(() => executionProgramHashV4({
      ...program(), refundTokens: [...program().refundTokens].reverse(),
    })).toThrow();
    expect(() => executionProgramHashV4({
      ...program(),
      calls: [{ ...program().calls[0]!, gasLimit: 1_000_001 }],
    })).toThrow();
    expect(() => executionProgramHashV4({
      ...program(),
      calls: [{ ...program().calls[0]!, approvals: [{
        ...program().calls[0]!.approvals[0]!, spender: "0x0000000000000000000000000000000000000000",
      }] }],
    })).toThrow(/spender/i);
  });
});
