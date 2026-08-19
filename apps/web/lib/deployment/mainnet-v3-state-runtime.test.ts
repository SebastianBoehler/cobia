import { describe, expect, it, vi } from "vitest";
import {
  createMainnetV3StateReader,
  mainnetV3StateSpec,
  parseMainnetV3StateMode,
} from "./mainnet-v3-state-runtime";

const blockHash = `0x${"1".repeat(64)}` as const;

describe("mainnet V3 state runtime", () => {
  it("accepts only explicit proposed or active verification modes", () => {
    expect(parseMainnetV3StateMode("proposed")).toBe("proposed");
    expect(parseMainnetV3StateMode("active")).toBe("active");
    expect(() => parseMainnetV3StateMode("latest")).toThrow("proposed or active");
  });

  it("commits the exact reviewed chain-196 activation values", () => {
    expect(mainnetV3StateSpec).toMatchObject({
      chainId: 196,
      riskManager: "0xc69A1Fb1DD8AeECfbc557e4fc6a03E5a95201ded",
      executor: "0xa31dDF9b68F0d3cE859c3dC2c12e17d9288231A0",
      activationAtSec: 1_787_229_041,
    });
    expect(mainnetV3StateSpec.tokens).toHaveLength(2);
    expect(mainnetV3StateSpec.permissions).toHaveLength(3);
  });

  it("pins every read to the selected block and normalizes contract tuples", async () => {
    const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "pendingToken") return [{ maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n }, 99n];
      if (functionName === "tokenLimits") return [10n, 50n, 1_000n];
      if (functionName === "permissions") return [blockHash, mainnetV3StateSpec.executor, 88n, false];
      return true;
    });
    const client = {
      getChainId: vi.fn(async () => 196),
      getBlock: vi.fn(async (input: { blockNumber?: bigint }) => input.blockNumber
        ? { hash: blockHash }
        : { number: 123n, hash: blockHash, timestamp: 77n }),
      getCode: vi.fn(async () => "0x6001" as const),
      readContract,
    };
    const reader = createMainnetV3StateReader(client);
    await expect(reader.latestBlock()).resolves.toEqual({ number: 123n, hash: blockHash, timestamp: 77n });
    await expect(reader.contractValue(mainnetV3StateSpec.riskManager, "pendingToken", [], 123n))
      .resolves.toEqual({ limits: { maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n }, activateAfter: 99n });
    await expect(reader.contractValue(mainnetV3StateSpec.riskManager, "tokenLimits", [], 123n))
      .resolves.toEqual({ maxRoute: 10n, maxWalletDaily: 50n, maxCumulative: 1_000n });
    await expect(reader.contractValue(mainnetV3StateSpec.registry, "permissions", [], 123n))
      .resolves.toEqual({ runtimeCodeHash: blockHash, target: mainnetV3StateSpec.executor, activateAfter: 88n, active: false });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 123n }));
    expect("sendTransaction" in reader).toBe(false);
  });
});
