import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getChainId = vi.fn(async () => 196);
const getBlockNumber = vi.fn(async () => 68_498_825n);
const readContract = vi.fn<(input: { functionName: string }) => Promise<unknown>>();

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: vi.fn(() => ({ getChainId, getBlockNumber, readContract })),
  http: vi.fn(() => undefined),
}));

import { readMainnetAccessStatus } from "./read-mainnet-access-status";

beforeEach(() => {
  getChainId.mockResolvedValue(196);
  readContract.mockImplementation(async ({ functionName }) => ({
    accessMode: 0,
    openAccessAfter: 1_787_440_661n,
    paused: false,
  })[functionName]);
});

afterEach(() => vi.clearAllMocks());

describe("mainnet public access status", () => {
  it("reports the scheduled onchain activation", async () => {
    await expect(readMainnetAccessStatus("https://rpc.invalid")).resolves.toMatchObject({
      chainId: 196,
      blockNumber: "68498825",
      state: "scheduled",
      activationAt: 1_787_440_661,
    });
  });

  it("reports public execution only after the access mode changes", async () => {
    readContract.mockImplementation(async ({ functionName }) => functionName === "accessMode" ? 1 : false);
    await expect(readMainnetAccessStatus("https://rpc.invalid")).resolves.toMatchObject({ state: "live" });
  });

  it("prioritizes the emergency pause", async () => {
    readContract.mockImplementation(async ({ functionName }) => ({
      accessMode: 1,
      openAccessAfter: 0n,
      paused: true,
    })[functionName]);
    await expect(readMainnetAccessStatus("https://rpc.invalid")).resolves.toMatchObject({ state: "paused" });
  });
});
