import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { captureCapabilityPortfolioV1 } from "./portfolio";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const block = {
  number: PROTOCOL_REGISTRY.auditedAtBlock.number,
  hash: PROTOCOL_REGISTRY.auditedAtBlock.hash,
};

describe("coding-agent public portfolio", () => {
  it("captures balances, executor allowances, and positions at one pinned block", async () => {
    const read = {
      getChainId: vi.fn(async () => 196),
      getBlock: vi.fn(async () => ({ hash: block.hash })),
      balanceOf: vi.fn(async (token: string) => token.endsWith("8") ? 10n : 20n),
      allowance: vi.fn(async () => 3n),
    };
    const result = await captureCapabilityPortfolioV1({ owner, executor, block, read });

    expect(result.balances).toHaveLength(2);
    expect(result.allowances).toEqual(result.balances.map(({ token }) => ({
      token, owner, spender: executor, atomic: "3",
    })));
    expect(result.positions).toHaveLength(2);
    expect(read.balanceOf).toHaveBeenCalledTimes(4);
    expect(read.getBlock).toHaveBeenCalledWith(BigInt(block.number));
  });

  it("rejects another chain or block before reading wallet state", async () => {
    for (const read of [{
      getChainId: async () => 1952,
      getBlock: async () => ({ hash: block.hash }),
      balanceOf: vi.fn(async () => 0n), allowance: vi.fn(async () => 0n),
    }, {
      getChainId: async () => 196,
      getBlock: async () => ({ hash: `0x${"55".repeat(32)}` as const }),
      balanceOf: vi.fn(async () => 0n), allowance: vi.fn(async () => 0n),
    }]) {
      await expect(captureCapabilityPortfolioV1({ owner, executor, block, read }))
        .rejects.toThrow(/chain|block/i);
      expect(read.balanceOf).not.toHaveBeenCalled();
    }
  });
});
