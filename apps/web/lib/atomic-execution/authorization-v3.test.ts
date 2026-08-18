import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
  atomicAuthorizationTypedDataV3,
  buildAtomicAuthorizationV3,
  signAtomicAuthorizationV3,
} from "./authorization-v3";
import { atomicProgramV3, executorV3, hashV3 } from "./v3-test-fixture";

const key = `0x${"63".repeat(32)}` as const;

describe("atomic capability authorization V3", () => {
  it("signs only the exact chain-196 executor commitment", async () => {
    const program = atomicProgramV3();
    const authorization = buildAtomicAuthorizationV3(program, executorV3);
    const account = privateKeyToAccount(key);
    const signature = await signAtomicAuthorizationV3({
      program, authorization, expectedExecutor: executorV3,
      signTypedData: (parameters) => account.signTypedData(parameters),
    });
    expect(await recoverTypedDataAddress({
      ...atomicAuthorizationTypedDataV3(authorization), signature,
    })).toBe(account.address);
  });

  it.each([
    ["executor", "0x9999999999999999999999999999999999999999"],
    ["chainId", 1952n],
    ["executionCommitment", hashV3("a")],
    ["policyHash", hashV3("b")],
    ["manifestHash", hashV3("c")],
    ["canonicalProgramHash", hashV3("d")],
    ["simulationHash", hashV3("e")],
    ["pinnedBlockNumber", 124n],
    ["pinnedBlockHash", hashV3("f")],
    ["owner", "0x8888888888888888888888888888888888888888"],
    ["inputToken", "0x9999999999999999999999999999999999999999"],
    ["inputAmount", 2n],
    ["deadline", 2n],
    ["nonce", hashV3("a")],
  ] as const)("rejects changed %s before signing", async (field, changed) => {
    const program = atomicProgramV3();
    const authorization = buildAtomicAuthorizationV3(program, executorV3);
    const signTypedData = vi.fn();
    await expect(signAtomicAuthorizationV3({
      program, authorization: { ...authorization, [field]: changed },
      expectedExecutor: executorV3, signTypedData,
    })).rejects.toThrow("does not match");
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
