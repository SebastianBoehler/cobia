import { describe, expect, it, vi } from "vitest";
import { replayGeneralAssetStageOnFork } from "./general-asset-stage";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

function request() {
  const stage = { stageId: hash("1"), index: 0, chainId: 196 as const,
    predecessorStageId: null, adapter: { id: "okx.swap", version: 1 }, target: address("3"),
    targetRuntimeCodeHash: hash("2"), calldata: "0x12345678", nativeValueAtomic: "0",
    input: { token: address("4"), maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: hash("3"), valuationEvidenceHash: hash("4") },
    outputs: [{ token: address("5"), minimumIncreaseAtomic: "90", identityEvidenceHash: hash("5") }],
    approvals: [{ token: address("4"), spender: address("6"), maximumAtomic: "100" }],
    refundTokens: [address("4"), address("5")], finality: { confirmations: 12 },
    delivery: { kind: "none" as const } };
  return { chainId: 196 as const, blockNumber: "123", blockHash: hash("6"), owner: address("1"),
    executor: address("2"), stage, compiled: { stageId: stage.stageId, chainId: 196 as const,
      adapterKey: hash("7"), target: stage.target, targetRuntimeCodeHash: stage.targetRuntimeCodeHash,
      data: stage.calldata, valueAtomic: "0", gasLimit: 300_000, approvals: stage.approvals,
      refundTokens: stage.refundTokens, quoteHash: hash("8"), expiresAtSec: 2_000_000_000 } };
}

describe("general asset remote stage replay", () => {
  it("rejects any compiled call that differs from the committed stage before starting replay", async () => {
    const rpc = vi.fn();
    const input = request();
    input.compiled.data = "0x87654321";
    await expect(replayGeneralAssetStageOnFork(input, rpc)).rejects.toThrow(/does not match/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
