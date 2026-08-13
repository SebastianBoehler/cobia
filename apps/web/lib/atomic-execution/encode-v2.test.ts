import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { buildAtomicAuthorizationV2 } from "./authorization-v2";
import { COBIA_EXECUTOR_V2_ABI, encodeAtomicExecutionCallV2 } from "./encode-v2";
import type { AtomicExecutionProgramV2 } from "./types-v2";

const executor = "0x5555555555555555555555555555555555555555" as const;

function program(): AtomicExecutionProgramV2 {
  return {
    policyHash: `0x${"11".repeat(32)}`,
    manifestHash: `0x${"22".repeat(32)}`,
    canonicalProgramHash: `0x${"33".repeat(32)}`,
    simulationHash: `0x${"44".repeat(32)}`,
    pinnedBlockNumber: 123n,
    pinnedBlockHash: `0x${"55".repeat(32)}`,
    owner: "0x1111111111111111111111111111111111111111",
    inputToken: "0x2222222222222222222222222222222222222222",
    inputAmount: 1_000_000n,
    deadline: 1_800_000_000n,
    nonce: `0x${"66".repeat(32)}`,
    refundTokens: [
      "0x2222222222222222222222222222222222222222",
      "0x4444444444444444444444444444444444444444",
    ],
    actions: [{
      capabilityKey: `0x${"77".repeat(32)}`,
      target: "0x3333333333333333333333333333333333333333",
      approvals: [{ token: "0x2222222222222222222222222222222222222222", amount: 1_000_000n }],
      data: "0x12345678",
    }],
    constraints: [{ token: "0x4444444444444444444444444444444444444444", minimumIncrease: 990_000n }],
  };
}

describe("atomic capability executor encoding", () => {
  it("encodes one exact zero-value V2 call for the user wallet", () => {
    const value = program();
    const authorization = buildAtomicAuthorizationV2(value, executor);
    const signature = `0x${"88".repeat(65)}` as const;
    const call = encodeAtomicExecutionCallV2({
      program: value,
      authorization,
      expectedExecutor: executor,
      signature,
    });

    expect(call).toMatchObject({ to: executor, value: 0n });
    const decoded = decodeFunctionData({ abi: COBIA_EXECUTOR_V2_ABI, data: call.data });
    expect(decoded.functionName).toBe("execute");
    if (decoded.functionName !== "execute") throw new Error("Expected V2 execute call");
    expect(decoded.args[0].canonicalProgramHash).toBe(value.canonicalProgramHash);
    expect(decoded.args[1].executionCommitment).toBe(authorization.executionCommitment);
    expect(decoded.args[2]).toBe(signature);
  });

  it("rejects a changed authorization or malformed signature", () => {
    const value = program();
    const authorization = buildAtomicAuthorizationV2(value, executor);
    expect(() => encodeAtomicExecutionCallV2({
      program: value,
      authorization: { ...authorization, inputAmount: 2n },
      expectedExecutor: executor,
      signature: `0x${"88".repeat(65)}`,
    })).toThrow("does not match");
    expect(() => encodeAtomicExecutionCallV2({
      program: value,
      authorization,
      expectedExecutor: executor,
      signature: "0x12",
    })).toThrow("signature");
  });
});
