import { describe, expect, it, vi } from "vitest";
import { routeSnapshotDependencies } from "./route-snapshot-client";

function client(hash: `0x${string}` | null) {
  return {
    getBlock: vi.fn().mockResolvedValue({
      number: 123n,
      hash,
      timestamp: 456n,
    }),
    getChainId: vi.fn(),
    getCode: vi.fn(),
    getStorageAt: vi.fn(),
    readContract: vi.fn(),
  } as never;
}

describe("routeSnapshotDependencies", () => {
  it("captures the latest number, hash, and timestamp as one reference", async () => {
    const publicClient = client(`0x${"ab".repeat(32)}`);
    const dependencies = routeSnapshotDependencies(publicClient);

    await expect(dependencies.getLatestBlock()).resolves.toEqual({
      number: 123n,
      hash: `0x${"ab".repeat(32)}`,
      timestamp: 456n,
    });
  });

  it("rejects a latest block without a hash", async () => {
    const dependencies = routeSnapshotDependencies(client(null));
    await expect(dependencies.getLatestBlock()).rejects.toThrow("without a hash");
  });
});
