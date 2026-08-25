import { describe, expect, it, vi } from "vitest";
import { runWalletSequence } from "./run-wallet-sequence";

const approval = { to: "0x1111111111111111111111111111111111111111" as const,
  data: "0x095ea7b3" as const, value: "0x0" as const };
const execution = { to: "0x2222222222222222222222222222222222222222" as const,
  data: "0x12345678" as const, value: "0x0" as const, stageId: "01-swap" };
const approvalHash = `0x${"11".repeat(32)}` as const;
const executionHash = `0x${"22".repeat(32)}` as const;

describe("wallet call sequence", () => {
  it("stops before execution when exact approval was not established", async () => {
    const send = vi.fn().mockResolvedValueOnce(approvalHash);
    await expect(runWalletSequence({
      initial: { chainId: 196, approvals: [approval], transactions: [execution] },
      refresh: vi.fn(async () => ({ chainId: 196, approvals: [approval], transactions: [execution] })),
      switchChain: vi.fn(), send, onApproval: vi.fn(), onTransaction: vi.fn(),
    })).rejects.toThrow(/exact verified amount/i);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("advances automatically while retaining every receipt hash", async () => {
    const send = vi.fn().mockResolvedValueOnce(approvalHash).mockResolvedValueOnce(executionHash);
    await expect(runWalletSequence({
      initial: { chainId: 196, approvals: [approval], transactions: [execution] },
      refresh: vi.fn(async () => ({ chainId: 196, approvals: [], transactions: [execution] })),
      switchChain: vi.fn(), send, onApproval: vi.fn(), onTransaction: vi.fn(),
    })).resolves.toMatchObject({ hashes: [approvalHash, executionHash], transactionHash: executionHash });
  });
});
