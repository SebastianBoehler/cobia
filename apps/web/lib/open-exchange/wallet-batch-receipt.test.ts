import { describe, expect, it, vi } from "vitest";
import { verifyOpenWalletBatchReceiptsV1 } from "./wallet-batch-receipt";

const owner = "0x1111111111111111111111111111111111111111" as const;
const target = "0x2222222222222222222222222222222222222222" as const;
const hash = `0x${"33".repeat(32)}` as const;
const blockHash = `0x${"44".repeat(32)}` as const;
const batch = { version: 1, kind: "wallet-call-batch", owner, deadline: 2_000_000_000,
  assurance: "exact-call-fork-replay", stages: [{ stageId: "01-route", chainId: 196,
    calls: [{ to: target, data: "0x12345678", value: "0x0" }] }] };
const approvalTarget = "0x5555555555555555555555555555555555555555" as const;
const spender = "0x6666666666666666666666666666666666666666";
const approval = (amount: bigint) => `0x095ea7b3${spender.slice(2).padStart(64, "0")}${amount
  .toString(16).padStart(64, "0")}` as const;

describe("open wallet batch receipt", () => {
  it("attributes every exact owner call at a canonical confirmed block", async () => {
    await expect(verifyOpenWalletBatchReceiptsV1({ batch, owner, transactionHashes: [hash],
      latestBlockNumber: 102n,
      readTransaction: vi.fn(async () => ({ hash, from: owner, to: target,
        input: "0x12345678" as const, value: 0n })),
      readReceipt: vi.fn(async () => ({ transactionHash: hash, status: "success" as const,
        blockNumber: 100n, blockHash })),
      readCanonicalBlock: vi.fn(async () => ({ number: 100n, hash: blockHash, timestamp: 1_999_999_999n })),
    })).resolves.toMatchObject({ transactionHash: hash, receipts: [{ stageId: "01-route" }] });
  });

  it("rejects a changed target", async () => {
    await expect(verifyOpenWalletBatchReceiptsV1({ batch, owner, transactionHashes: [hash],
      latestBlockNumber: 102n,
      readTransaction: async () => ({ hash, from: owner,
        to: "0x9999999999999999999999999999999999999999", input: "0x12345678" as const, value: 0n }),
      readReceipt: async () => ({ transactionHash: hash, status: "success" as const,
        blockNumber: 100n, blockHash }),
      readCanonicalBlock: async () => ({ number: 100n, hash: blockHash, timestamp: 1_999_999_999n }),
    })).rejects.toThrow(/verified call/i);
  });

  it("rejects a verified wallet call mined after its signed deadline", async () => {
    await expect(verifyOpenWalletBatchReceiptsV1({ batch, owner, transactionHashes: [hash],
      latestBlockNumber: 102n,
      readTransaction: async () => ({ hash, from: owner, to: target,
        input: "0x12345678" as const, value: 0n }),
      readReceipt: async () => ({ transactionHash: hash, status: "success" as const,
        blockNumber: 100n, blockHash }),
      readCanonicalBlock: async () => ({ number: 100n, hash: blockHash, timestamp: 2_000_000_001n }),
    })).rejects.toThrow(/deadline/i);
  });

  it("attributes a sufficient user-selected approval under the flexible assurance", async () => {
    const flexible = { ...batch, assurance: "exact-execution-flexible-approval",
      stages: [{ ...batch.stages[0]!, calls: [{ to: approvalTarget, data: approval(1_000_000n), value: "0x0" }] }] };
    await expect(verifyOpenWalletBatchReceiptsV1({ batch: flexible, owner,
      transactionHashes: [hash], latestBlockNumber: 102n,
      readTransaction: vi.fn(async () => ({ hash, from: owner, to: approvalTarget,
        input: approval(2_000_000n), value: 0n })),
      readReceipt: vi.fn(async () => ({ transactionHash: hash, status: "success" as const,
        blockNumber: 100n, blockHash })),
      readCanonicalBlock: vi.fn(async () => ({ number: 100n, hash: blockHash,
        timestamp: 1_999_999_999n })),
    })).resolves.toMatchObject({ transactionHash: hash });
  });

  it("keeps legacy exact-call batches exact", async () => {
    const exact = { ...batch,
      stages: [{ ...batch.stages[0]!, calls: [{ to: approvalTarget, data: approval(1_000_000n), value: "0x0" }] }] };
    await expect(verifyOpenWalletBatchReceiptsV1({ batch: exact, owner,
      transactionHashes: [hash], latestBlockNumber: 102n,
      readTransaction: vi.fn(async () => ({ hash, from: owner, to: approvalTarget,
        input: approval(2_000_000n), value: 0n })),
      readReceipt: vi.fn(async () => ({ transactionHash: hash, status: "success" as const,
        blockNumber: 100n, blockHash })),
      readCanonicalBlock: vi.fn(async () => ({ number: 100n, hash: blockHash,
        timestamp: 1_999_999_999n })),
    })).rejects.toThrow(/does not match the verified call/i);
  });
});
