import { describe, expect, it } from "vitest";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { buildRoutePolicyV2 } from "./route-policy-v2";

describe("buildRoutePolicyV2", () => {
  it("builds the single canonical browser and MCP policy shape", () => {
    const policy = buildRoutePolicyV2({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      asset: SUPPORTED_ASSETS[1].address,
      principalAtomic: "25000000000",
      protocolExposureBps: 4_000,
      minTvlUsdE6: "250000000000",
      minPreGasApyBps: 200,
      nowSec: 1_900_000_000,
    });

    expect(policy).toMatchObject({
      version: 2,
      executionChainId: 196,
      protocolExposureBps: 4_000,
      minPreGasApyBps: 200,
      maxSnapshotAgeSec: 300,
      deadline: 1_900_001_800,
      noBridges: true,
      allowedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
      maxSlippageBps: 50,
      horizonDays: 30,
    });
    expect(policy.allowedOutputAssets).toEqual(
      SUPPORTED_ASSETS.map(({ address }) => address.toLowerCase()).sort(),
    );
  });

  it("rejects a zero APY floor at the monetized product ingress", () => {
    expect(() => buildRoutePolicyV2({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      asset: SUPPORTED_ASSETS[0].address,
      principalAtomic: "25000000000",
      protocolExposureBps: 4_000,
      minTvlUsdE6: "250000000000",
      minPreGasApyBps: 0,
      nowSec: 1_900_000_000,
    })).toThrow("Minimum pre-gas APY must be positive");
  });

  it("builds an atomic Swap policy without applying Earn APY semantics", () => {
    const policy = buildRoutePolicyV2({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      asset: SUPPORTED_ASSETS[0].address,
      principalAtomic: "10000000",
      protocolExposureBps: 10_000,
      minTvlUsdE6: "0",
      minPreGasApyBps: 0,
      objective: {
        kind: "swap",
        outputAsset: SUPPORTED_ASSETS[1].address,
        minimumOutputAtomic: "9950000",
      },
      nowSec: 1_900_000_000,
    });

    expect(policy.objective).toEqual({
      kind: "swap",
      outputAsset: SUPPORTED_ASSETS[1].address.toLowerCase(),
      minimumOutputAtomic: "9950000",
    });
  });

  it("builds an atomic Profit policy with a strictly higher final balance", () => {
    expect(buildRoutePolicyV2({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      asset: SUPPORTED_ASSETS[0].address,
      principalAtomic: "10000000",
      protocolExposureBps: 10_000,
      minTvlUsdE6: "0",
      minPreGasApyBps: 0,
      objective: { kind: "profit", minimumFinalAtomic: "10010000" },
      nowSec: 1_900_000_000,
    }).objective).toEqual({ kind: "profit", minimumFinalAtomic: "10010000" });
  });
});
