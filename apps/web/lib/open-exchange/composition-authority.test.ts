import { commitment, type CapabilityCompositionSnapshotV1 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";
import { deriveCompositionAuthorityV1 } from "./composition-authority";

const owner = "0x1111111111111111111111111111111111111111";
const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG;
const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0;
const requestId = "550e8400-e29b-41d4-a716-446655440099";
const capturedAt = "2026-08-22T14:00:00.000Z";
const blockHash = `0x${"22".repeat(32)}` as const;

const policy = buildCapabilityCompositionPolicyV1({
  requestId, owner, inputToken: usdg.underlying.address, inputAtomic: "1000000",
  nonce: `0x${"11".repeat(32)}`, nowSec: 2_000_000_000,
  displayGoal: "Enter the best route", competitionDurationSec: 300,
  deadlineDurationSec: 600, maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900, horizonDays: 30, forbiddenTargets: [],
});

const snapshot: CapabilityCompositionSnapshotV1 = {
  version: 1, kind: "capability-composition", requestId, capturedAt,
  manifestHash: commitment(productionCapabilityManifestV1()),
  route: {
    version: 2, requestId, chainId: 196, blockNumber: "70000000", blockHash,
    capturedAt, adapterRegistryHash: registryHash,
    scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
    valuations: [
      { asset: usdg.underlying.address.toLowerCase() as `0x${string}`, decimals: 6,
        priceUsdE8: "100000000" },
      { asset: usdt0.underlying.address.toLowerCase() as `0x${string}`, decimals: 6,
        priceUsdE8: "100000000" },
    ].sort((left, right) => left.asset.localeCompare(right.asset)),
    opportunities: [{
      id: "aave-usdg", kind: "aave-v3-supply", adapterId: "aave-v3@1",
      asset: usdg.underlying.address.toLowerCase() as `0x${string}`,
      supplyRateBps: 400, tvlUsdE6: "100000000", availableLiquidityAtomic: "100000000",
      validatedSupplyAtomic: "1000000",
    }, {
      id: "curve-usdg-usdt0", kind: "curve-stableswap-ng-exact-input",
      adapterId: "curve-stableswap-ng@1", pool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
      tokenIn: usdg.underlying.address, tokenOut: usdt0.underlying.address,
      inputIndex: 0, outputIndex: 1, fee: "1000000",
      quotedInputAtomic: "1000000", quotedOutputAtomic: "999000",
    }, {
      id: "aave-usdt0", kind: "aave-v3-supply", adapterId: "aave-v3@1",
      asset: usdt0.underlying.address, supplyRateBps: 500, tvlUsdE6: "100000000",
      availableLiquidityAtomic: "100000000", validatedSupplyAtomic: "999000",
    }],
  },
  gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" },
};

describe("deriveCompositionAuthorityV1", () => {
  it("derives the exact legacy authority for a direct supply", () => {
    const result = deriveCompositionAuthorityV1(policy, snapshot, {
      inputAtomic: "1000000",
      actions: [{ capabilityId: "aave-v3.supply", capabilityVersion: 1,
        valueAtomic: "0", parameters: { asset: usdg.underlying.address, amountAtomic: "1000000" } }],
      balanceConstraints: [{ kind: "minimumIncrease", token: usdg.aToken.address,
        atomic: "999999" }],
    });

    expect(result.policy).toMatchObject({
      kind: "general-onchain",
      balanceConstraints: [{ kind: "minimumIncrease",
        token: usdg.aToken.address.toLowerCase(), atomic: "999999" }],
      objective: { kind: "satisfy" },
    });
    expect(result.snapshot).toMatchObject({ blockNumber: "70000000",
      manifestHash: policy.manifestHash });
  });

  it("derives a swap then supply authority from committed opportunities", () => {
    const result = deriveCompositionAuthorityV1(policy, snapshot, {
      inputAtomic: "1000000",
      actions: [{ capabilityId: "curve-stableswap-ng.exact-input", capabilityVersion: 1,
        valueAtomic: "0", parameters: { tokenIn: usdg.underlying.address,
          tokenOut: usdt0.underlying.address, amountInAtomic: "1000000",
          minimumOutputAtomic: "999000" } },
      { capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0",
        parameters: { asset: usdt0.underlying.address, amountAtomic: "999000" } }],
      balanceConstraints: [{ kind: "minimumIncrease", token: usdt0.aToken.address,
        atomic: "998999" }],
    });

    expect(result.policy.allowedCapabilities).toEqual(policy.allowedCapabilities);
    expect(result.policy.balanceConstraints[0]).toMatchObject({
      token: usdt0.aToken.address.toLowerCase(), atomic: "998999",
    });
  });

  it("rejects capability widening, excessive loss, and the wrong receipt", () => {
    const direct = { inputAtomic: "1000000", actions: [{ capabilityId: "aave-v3.borrow",
      capabilityVersion: 1, valueAtomic: "0", parameters: {} }],
      balanceConstraints: [{ kind: "minimumIncrease", token: usdg.aToken.address,
        atomic: "999999" }] };
    expect(() => deriveCompositionAuthorityV1(policy, snapshot, direct)).toThrow(/allowed/i);
    const swap = { inputAtomic: "1000000", actions: [{
      capabilityId: "curve-stableswap-ng.exact-input", capabilityVersion: 1,
      valueAtomic: "0", parameters: { tokenIn: usdg.underlying.address,
        tokenOut: usdt0.underlying.address, amountInAtomic: "1000000",
        minimumOutputAtomic: "980000" },
    }, { capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0",
      parameters: { asset: usdt0.underlying.address, amountAtomic: "980000" } }],
      balanceConstraints: [{ kind: "minimumIncrease", token: usdg.aToken.address,
        atomic: "979999" }] };
    expect(() => deriveCompositionAuthorityV1(policy, snapshot, swap)).toThrow(/quote|loss|opportunity/i);
  });
});
