import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
  atomicAuthorizationTypedDataV2,
  buildAtomicAuthorizationV2,
  signAtomicAuthorizationV2,
} from "./authorization-v2";
import {
  atomicAuthorizationPayloadHashV2,
  atomicExecutionProgramHashV2,
  type AtomicExecutionProgramV2,
} from "./types-v2";

const executor = "0x5555555555555555555555555555555555555555" as const;
const key = `0x${"63".repeat(32)}` as const;

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
    constraints: [{
      token: "0x4444444444444444444444444444444444444444",
      minimumIncrease: 990_000n,
    }],
  };
}

describe("atomic capability authorization V2", () => {
  it("matches the Solidity ABI golden commitments", () => {
    const value = program();
    const authorization = buildAtomicAuthorizationV2(value, executor);
    expect(atomicExecutionProgramHashV2(value)).toBe(
      "0xa85883437b578ca1f365a565083b22fe473e1559d73d8cf6b289ad7c8121e4ae",
    );
    expect(atomicAuthorizationPayloadHashV2(authorization)).toBe(
      "0xf24bfc4a91a7c9d74099d4b830436cd5ae9cffd76dbdd0b5008bf524cfb3166d",
    );
  });

  it("signs only the exact chain-196 executor commitment", async () => {
    const value = program();
    const authorization = buildAtomicAuthorizationV2(value, executor);
    const account = privateKeyToAccount(key);
    const signature = await signAtomicAuthorizationV2({
      program: value,
      authorization,
      expectedExecutor: executor,
      signTypedData: (parameters) => account.signTypedData(parameters),
    });
    expect(await recoverTypedDataAddress({
      ...atomicAuthorizationTypedDataV2(authorization),
      signature,
    })).toBe(account.address);
  });

  it.each([
    ["executor", "0x9999999999999999999999999999999999999999"],
    ["chainId", 1952n],
    ["executionCommitment", `0x${"81".repeat(32)}`],
    ["policyHash", `0x${"82".repeat(32)}`],
    ["manifestHash", `0x${"83".repeat(32)}`],
    ["canonicalProgramHash", `0x${"84".repeat(32)}`],
    ["simulationHash", `0x${"85".repeat(32)}`],
    ["pinnedBlockNumber", 124n],
    ["pinnedBlockHash", `0x${"86".repeat(32)}`],
    ["owner", "0x8888888888888888888888888888888888888888"],
    ["inputToken", "0x9999999999999999999999999999999999999999"],
    ["inputAmount", 2n],
    ["deadline", 2n],
    ["nonce", `0x${"87".repeat(32)}`],
  ] as const)("rejects changed %s before calling the signer", async (field, changed) => {
    const value = program();
    const authorization = buildAtomicAuthorizationV2(value, executor);
    const signTypedData = vi.fn();
    await expect(signAtomicAuthorizationV2({
      program: value,
      authorization: { ...authorization, [field]: changed },
      expectedExecutor: executor,
      signTypedData,
    })).rejects.toThrow("does not match");
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
