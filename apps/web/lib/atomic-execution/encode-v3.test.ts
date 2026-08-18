import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { buildAtomicAuthorizationV3 } from "./authorization-v3";
import { COBIA_EXECUTOR_V3_ABI, encodeAtomicExecutionCallV3 } from "./encode-v3";
import { atomicProgramV3, executorV3 } from "./v3-test-fixture";

describe("atomic capability executor V3 encoding", () => {
  it("encodes one exact zero-value call for the user wallet", () => {
    const program = atomicProgramV3();
    const authorization = buildAtomicAuthorizationV3(program, executorV3);
    const signature = `0x${"88".repeat(65)}` as const;
    const call = encodeAtomicExecutionCallV3({
      program, authorization, expectedExecutor: executorV3, signature,
    });
    expect(call).toMatchObject({ to: executorV3, value: 0n });
    const decoded = decodeFunctionData({ abi: COBIA_EXECUTOR_V3_ABI, data: call.data });
    expect(decoded.functionName).toBe("execute");
    if (decoded.functionName !== "execute") throw new Error("Expected V3 execute call");
    expect(decoded.args[0].predicates[0]?.read.runtimeCodeHash)
      .toBe(program.predicates[0]?.read.runtimeCodeHash);
    expect(decoded.args[1].executionCommitment).toBe(authorization.executionCommitment);
    expect(decoded.args[2]).toBe(signature);
  });

  it("rejects changed authorization and malformed signatures", () => {
    const program = atomicProgramV3();
    const authorization = buildAtomicAuthorizationV3(program, executorV3);
    expect(() => encodeAtomicExecutionCallV3({
      program, authorization: { ...authorization, inputAmount: 2n },
      expectedExecutor: executorV3, signature: `0x${"88".repeat(65)}`,
    })).toThrow("does not match");
    expect(() => encodeAtomicExecutionCallV3({
      program, authorization, expectedExecutor: executorV3, signature: "0x12",
    })).toThrow("signature");
  });
});
