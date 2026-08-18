import type { AtomicExecutionProgramV3 } from "./types-v3";

export const executorV3 = "0x5555555555555555555555555555555555555555" as const;
export const hashV3 = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

export function atomicProgramV3(): AtomicExecutionProgramV3 {
  return {
    policyHash: hashV3("1"),
    manifestHash: hashV3("2"),
    canonicalProgramHash: hashV3("3"),
    simulationHash: hashV3("4"),
    pinnedBlockNumber: 123n,
    pinnedBlockHash: hashV3("5"),
    owner: "0x1111111111111111111111111111111111111111",
    inputToken: "0x2222222222222222222222222222222222222222",
    inputAmount: 1_000_000n,
    deadline: 1_800_000_000n,
    nonce: hashV3("6"),
    refundTokens: [
      "0x2222222222222222222222222222222222222222",
      "0x4444444444444444444444444444444444444444",
    ],
    actions: [{
      capabilityKey: hashV3("7"),
      target: "0x3333333333333333333333333333333333333333",
      approvals: [{ token: "0x2222222222222222222222222222222222222222", amount: 1_000_000n }],
      data: "0x12345678",
    }],
    constraints: [{
      token: "0x4444444444444444444444444444444444444444",
      kind: 1,
      minimum: 990_000n,
    }],
    predicates: [{
      read: {
        target: "0x4444444444444444444444444444444444444444",
        runtimeCodeHash: hashV3("8"),
        data: "0x70a082310000000000000000000000001111111111111111111111111111111111111111",
        returnWordIndex: 0,
        decodeType: 0,
        gasLimit: 50_000,
      },
      phase: 1,
      comparator: 1,
      bound: `0x${"0".repeat(48)}00000000000f1b30`,
    }],
  };
}
