import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { verifyRawWalletStageV1 } from "../src";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const output = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const data = "0x123456780000000000000000000000000000000000000000000000000000000000000001" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const stage = {
  id: "01-call", kind: "wallet-transaction" as const, chainId: 196 as const, dependsOn: [],
  provider: "evm.raw@1", quoteHash: hash("1"), responseHash: hash("2"), fetchedAt: 1_786_900_000,
  expiresAt: 1_786_900_300, sender: owner, recipient: owner,
  input: { token, atomic: "10" }, output: { chainId: 196 as const, token: output, minimumAtomic: "20" },
  approval: { token, spender: target, maximumAtomic: "10" },
  transaction: { target, selector: "0x12345678" as const, dataHash: keccak256(data), valueAtomic: "0" },
  tools: ["agent-authored"],
};
const artifact = { version: 1, provider: "evm.raw@1", stageId: "01-call", transaction: {
  chainId: 196, from: owner, to: target, data, valueAtomic: "0",
} };

describe("generic raw wallet stage", () => {
  it("projects an exact unsigned call without knowing the protocol", () => {
    const result = verifyRawWalletStageV1({ stage, artifact, currentAllowanceAtomic: "0" });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.calls).toEqual([
      { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [target, 10n] }), value: "0x0" },
      { to: target, data, value: "0x0" },
    ]);
  });

  it("resets a pre-existing allowance before granting the exact bounded amount", () => {
    const result = verifyRawWalletStageV1({ stage, artifact, currentAllowanceAtomic: "7" });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.calls[0]).toEqual({
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [target, 0n] }),
      value: "0x0",
    });
    expect(result.calls).toHaveLength(3);
  });

  it("binds a native OKB input directly to the exact transaction value", () => {
    const native = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const nativeStage = { ...stage, input: { token: native, atomic: "5" },
      approval: undefined, transaction: { ...stage.transaction, valueAtomic: "5" } };
    const nativeArtifact = { ...artifact,
      transaction: { ...artifact.transaction, valueAtomic: "5" } };

    expect(verifyRawWalletStageV1({
      stage: nativeStage, artifact: nativeArtifact, currentAllowanceAtomic: "0",
    })).toEqual({ accepted: true, calls: [{ to: target, data, value: "0x5" }] });
    expect(verifyRawWalletStageV1({
      stage: { ...nativeStage, input: { token: native, atomic: "4" } },
      artifact: nativeArtifact, currentAllowanceAtomic: "0",
    })).toEqual({ accepted: false, errorCodes: ["RAW_NATIVE_VALUE_MISMATCH"] });
  });

  it.each([
    ["target", { transaction: { ...artifact.transaction, to: output } }],
    ["sender", { transaction: { ...artifact.transaction, from: output } }],
    ["calldata", { transaction: { ...artifact.transaction, data: "0x12345679" } }],
    ["value", { transaction: { ...artifact.transaction, valueAtomic: "1" } }],
    ["chain", { transaction: { ...artifact.transaction, chainId: 1 } }],
  ])("rejects %s drift", (_label, change) => {
    expect(verifyRawWalletStageV1({
      stage, artifact: { ...artifact, ...change }, currentAllowanceAtomic: "0",
    })).toMatchObject({ accepted: false });
  });

  it("rejects authority, signing, and send fields", () => {
    expect(verifyRawWalletStageV1({
      stage,
      artifact: { ...artifact, privateKey: hash("f") },
      currentAllowanceAtomic: "0",
    })).toEqual({ accepted: false, errorCodes: ["RAW_ARTIFACT_INVALID"] });
  });
});
