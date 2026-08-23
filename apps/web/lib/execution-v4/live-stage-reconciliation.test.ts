import { describe, expect, it, vi } from "vitest";
import { reconcileGeneralAssetStageLiveV4 } from "./live-stage-reconciliation";
import type { GeneralAssetExecutionBundleV4 } from "./stage-artifact";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const stageId = hash("2");
const transactionHash = hash("9");

const bundle = {
  version: 4, kind: "general-asset-execution", programId: hash("1"), owner,
  deadline: 2_000_000_300,
  finalOutput: { chainId: 196, token, minimumAtomic: "90" },
  stages: [{ stageId, ordinal: 0, chainId: 196, predecessorStageId: null, inputToken: token,
    requiredConfirmations: 12,
    transaction: { chainId: 196, from: owner, to: target, nonce: "7", value: "0x0", data: "0x12345678" },
    expectedLogs: [{ address: target, topics: [hash("3")], data: "0x" }],
    delivery: { kind: "none" }, evidenceHash: hash("4") }],
} as GeneralAssetExecutionBundleV4;

describe("live general asset stage reconciliation", () => {
  it("derives exact transaction, finality, logs and final output from the chain reader", async () => {
    const reconcileStageReceipt = vi.fn().mockResolvedValue({ state: "confirmed" });
    const result = await reconcileGeneralAssetStageLiveV4({ bundle, stageId,
      repository: {
        getProgram: vi.fn().mockResolvedValue({ stages: [{ stageId, transactionHash }] }),
        reconcileStageReceipt,
      },
      reader: {
        readTransaction: vi.fn().mockResolvedValue({ sender: owner, nonce: "7", target,
          valueAtomic: "0", calldata: "0x12345678" }),
        readReceipt: vi.fn().mockResolvedValue({ success: true, blockNumber: "100", blockHash: hash("5"),
          transactionIndex: 2, logs: bundle.stages[0]!.expectedLogs }),
        readCurrentBlockNumber: vi.fn().mockResolvedValue("111"),
        readCanonicalBlockHash: vi.fn().mockResolvedValue(hash("5")),
        readTokenBalance: vi.fn().mockResolvedValueOnce("10").mockResolvedValueOnce("100"),
      },
    });

    expect(result.state).toBe("confirmed");
    expect(reconcileStageReceipt).toHaveBeenCalledWith(bundle.programId, stageId, expect.objectContaining({
      observed: expect.objectContaining({ chainId: 196, transactionHash, sender: owner, nonce: "7",
        target, valueAtomic: "0", calldata: "0x12345678", success: true }),
      currentBlockNumber: "111", canonicalBlockHash: hash("5"),
      output: { expected: { token, minimumIncreaseAtomic: "90" },
        observed: { token, beforeAtomic: "10", afterAtomic: "100" } },
    }));
  });

  it("returns submitted without trusting caller data while the receipt is absent", async () => {
    const reconcileStageReceipt = vi.fn();
    const result = await reconcileGeneralAssetStageLiveV4({ bundle, stageId,
      repository: {
        getProgram: vi.fn().mockResolvedValue({ stages: [{ stageId, state: "submitted", transactionHash }] }),
        reconcileStageReceipt,
      },
      reader: {
        readTransaction: vi.fn(), readReceipt: vi.fn().mockResolvedValue(undefined),
        readCurrentBlockNumber: vi.fn(), readCanonicalBlockHash: vi.fn(), readTokenBalance: vi.fn(),
      },
    });
    expect(result).toMatchObject({ state: "submitted" });
    expect(reconcileStageReceipt).not.toHaveBeenCalled();
  });
});
