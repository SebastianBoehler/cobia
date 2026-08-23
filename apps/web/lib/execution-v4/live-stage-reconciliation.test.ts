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
        reconcileStageReceipt, recordBridgeDelivery: vi.fn(), recordBridgeFailure: vi.fn(),
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
        reconcileStageReceipt, recordBridgeDelivery: vi.fn(), recordBridgeFailure: vi.fn(),
      },
      reader: {
        readTransaction: vi.fn(), readReceipt: vi.fn().mockResolvedValue(undefined),
        readCurrentBlockNumber: vi.fn(), readCanonicalBlockHash: vi.fn(), readTokenBalance: vi.fn(),
      },
    });
    expect(result).toMatchObject({ state: "submitted" });
    expect(reconcileStageReceipt).not.toHaveBeenCalled();
  });

  it("records exact verified bridge delivery and otherwise remains finalized", async () => {
    const destinationToken = "0x4444444444444444444444444444444444444444" as const;
    const destinationStageId = hash("8");
    const bridged = { ...bundle,
      finalOutput: { chainId: 1 as const, token: destinationToken, minimumAtomic: "90" },
      stages: [
        { ...bundle.stages[0]!, delivery: { kind: "bridge" as const,
          destinationChainId: 1 as const, recipient: owner, token: destinationToken,
          minimumAtomic: "100" } },
        { ...bundle.stages[0]!, stageId: destinationStageId, ordinal: 1, chainId: 1 as const,
          predecessorStageId: stageId, inputToken: destinationToken,
          transaction: { ...bundle.stages[0]!.transaction, chainId: 1 as const, nonce: "8" },
          delivery: { kind: "none" as const } },
      ],
    } as GeneralAssetExecutionBundleV4;
    const messageId = hash("6");
    const destinationHash = hash("7");
    const recordBridgeDelivery = vi.fn().mockResolvedValue({ state: "delivered" });
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ stages: [{ stageId, transactionHash }] }),
      reconcileStageReceipt: vi.fn().mockResolvedValue({ state: "finalized" }),
      recordBridgeDelivery, recordBridgeFailure: vi.fn(),
    };
    const reader = {
      readTransaction: vi.fn().mockResolvedValue({ sender: owner, nonce: "7", target,
        valueAtomic: "0", calldata: "0x12345678" }),
      readReceipt: vi.fn().mockResolvedValue({ success: true, blockNumber: "100", blockHash: hash("5"),
        transactionIndex: 2, logs: bridged.stages[0]!.expectedLogs }),
      readCurrentBlockNumber: vi.fn().mockResolvedValue("111"),
      readCanonicalBlockHash: vi.fn().mockResolvedValue(hash("5")),
      readTokenBalance: vi.fn(),
    };
    const bridgeReader = {
      receipt: vi.fn().mockResolvedValue({ transactionHash: destinationHash, success: true,
        blockNumber: "200", blockHash: hash("9"), transactionIndex: 1, logs: [] }),
      canonicalBlockHash: vi.fn(async (chainId: number) => chainId === 196 ? hash("5") : hash("9")),
      currentBlockNumber: vi.fn().mockResolvedValue("211"),
      tokenBalance: vi.fn().mockResolvedValueOnce("10").mockResolvedValueOnce("110"),
      codeHash: vi.fn().mockResolvedValue(hash("a")),
    };
    const monitor = { locate: vi.fn().mockResolvedValue({ sourceTransactionHash: transactionHash,
      destinationChainId: 1, messageId, deliveryTransactionHash: destinationHash }),
    semantics: { sourceMessageId: vi.fn(() => messageId), destinationDelivery: vi.fn(() =>
      ({ messageId, recipient: owner, token: destinationToken, amountAtomic: "100",
        emitter: target, emitterRuntimeCodeHash: hash("a") })) },
    reader: bridgeReader };

    await expect(reconcileGeneralAssetStageLiveV4({ bundle: bridged, stageId,
      repository, reader, bridge: monitor })).resolves.toMatchObject({ state: "delivered" });
    expect(recordBridgeDelivery).toHaveBeenCalledWith(bridged.programId, stageId,
      expect.objectContaining({ messageId, deliveryTransactionHash: destinationHash,
        amountAtomic: "100" }));

    monitor.locate.mockResolvedValueOnce(undefined);
    await expect(reconcileGeneralAssetStageLiveV4({ bundle: bridged, stageId,
      repository, reader, bridge: monitor })).resolves.toMatchObject({ state: "finalized" });
  });
});
