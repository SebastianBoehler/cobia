import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { createProtocolReadClient } from "./read-client";

describe("createProtocolReadClient", () => {
  it("derives the pinned runtime code hash from viem bytecode", async () => {
    const client = createProtocolReadClient({
      async getChainId() { return 196; },
      async getBlock() { throw new Error("unused"); },
      async getCode({ blockNumber }: { blockNumber: bigint }) {
        if (blockNumber !== 77n) throw new Error("unbounded code read");
        return "0x6000";
      },
      async readContract() {
        return 1n;
      },
      async getStorageAt() { return undefined; },
    } as never);

    await expect(client.getRuntimeCodeHash({
      address: "0x1111111111111111111111111111111111111111",
      blockNumber: 77n,
    })).resolves.toBe(keccak256("0x6000"));
  });

  it("reports an undeployed address without hashing empty bytecode", async () => {
    const client = createProtocolReadClient({
      async getChainId() { return 196; },
      async getBlock() { throw new Error("unused"); },
      async getCode() { return "0x"; },
      async readContract() { return 1n; },
      async getStorageAt() { return undefined; },
    } as never);

    await expect(client.getRuntimeCodeHash({
      address: "0x1111111111111111111111111111111111111111",
      blockNumber: 77n,
    })).resolves.toBeUndefined();
  });

  it("forwards explicit block and storage reads", async () => {
    const block = {
      number: 77n,
      hash: `0x${"12".repeat(32)}` as const,
      timestamp: 99n,
    };
    const client = createProtocolReadClient({
      async getChainId() { return 196; },
      async getBlock({ blockNumber }: { blockNumber: bigint }) {
        if (blockNumber !== block.number) throw new Error("unbounded block read");
        return block;
      },
      async getCode() { return "0x6000"; },
      async getStorageAt({ blockNumber }: { blockNumber: bigint }) {
        if (blockNumber !== block.number) throw new Error("unbounded storage read");
        return `0x${"00".repeat(32)}` as const;
      },
      async readContract() { return 1n; },
    } as never);

    await expect(client.getBlock({ blockNumber: 77n })).resolves.toEqual(block);
    await expect(client.getStorageAt({
      address: "0x1111111111111111111111111111111111111111",
      slot: `0x${"00".repeat(32)}`,
      blockNumber: 77n,
    })).resolves.toBe(`0x${"00".repeat(32)}`);
  });
});
