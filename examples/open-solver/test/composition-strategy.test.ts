import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../../../apps/web/lib/adapters/registry";
import { productionCapabilityManifestV1 } from "../../../apps/web/lib/capabilities/manifest";
import { buildCapabilityCompositionPolicyV1 } from "../../../apps/web/lib/intents/composition-policy";
import { selectCompositionCandidate } from "../src/composition-strategy";

const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG;
const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0;
const requestId = "550e8400-e29b-41d4-a716-446655440099";
const policy = buildCapabilityCompositionPolicyV1({
  requestId, owner: "0x1111111111111111111111111111111111111111",
  inputToken: usdg.underlying.address, inputAtomic: "1000000",
  nonce: `0x${"11".repeat(32)}`, nowSec: 2_000_000_000,
  displayGoal: "Best yield", competitionDurationSec: 300, deadlineDurationSec: 600,
  maxConversionLossBps: 100, minimumReceiptValueBps: 9_900,
  horizonDays: 30, forbiddenTargets: [],
});
const capturedAt = "2033-05-18T03:33:30.000Z";
const commonRoute = {
  version: 2 as const, requestId, chainId: 196 as const, blockNumber: "70000000",
  blockHash: `0x${"22".repeat(32)}` as const, capturedAt,
  adapterRegistryHash: registryHash,
  scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
  valuations: [
    { asset: usdg.underlying.address, decimals: 6, priceUsdE8: "100000000" },
    { asset: usdt0.underlying.address, decimals: 6, priceUsdE8: "100000000" },
  ].sort((a, b) => a.asset.toLowerCase().localeCompare(b.asset.toLowerCase())),
};
const opportunities = [
  { id: "aave-usdg", kind: "aave-v3-supply", adapterId: "aave-v3@1",
    asset: usdg.underlying.address, supplyRateBps: 400, tvlUsdE6: "1",
    availableLiquidityAtomic: "100000000", validatedSupplyAtomic: "1000000" },
  { id: "curve", kind: "curve-stableswap-ng-exact-input",
    adapterId: "curve-stableswap-ng@1", pool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
    tokenIn: usdg.underlying.address, tokenOut: usdt0.underlying.address,
    inputIndex: 0, outputIndex: 1, fee: "1", quotedInputAtomic: "1000000",
    quotedOutputAtomic: "999000" },
  { id: "uniswap", kind: "uniswap-v3-exact-input", adapterId: "uniswap-v3@1",
    tokenIn: usdg.underlying.address, tokenOut: usdt0.underlying.address,
    feeTier: 100, quotedInputAtomic: "1000000", quotedOutputAtomic: "998000",
    estimatedGas: "100000" },
  { id: "aave-usdt-curve", kind: "aave-v3-supply", adapterId: "aave-v3@1",
    asset: usdt0.underlying.address, supplyRateBps: 800, tvlUsdE6: "1",
    availableLiquidityAtomic: "100000000", validatedSupplyAtomic: "999000" },
  { id: "aave-usdt-uni", kind: "aave-v3-supply", adapterId: "aave-v3@1",
    asset: usdt0.underlying.address, supplyRateBps: 900, tvlUsdE6: "1",
    availableLiquidityAtomic: "100000000", validatedSupplyAtomic: "998000" },
] as const;

function snapshot(items: readonly unknown[] = opportunities) {
  return CapabilityCompositionSnapshotV1Schema.parse({
    version: 1, kind: "capability-composition", requestId, capturedAt,
    manifestHash: commitment(productionCapabilityManifestV1()),
    route: { ...commonRoute, opportunities: items },
  gas: { priceAtomic: "1", nativePriceUsdE8: "10741000000" },
  });
}

describe("composition strategy", () => {
  it("selects the best committed swap then terminal Aave route", () => {
    const selected = selectCompositionCandidate(policy, snapshot());

    expect(selected?.actions.map(({ capabilityId }) => capabilityId)).toEqual([
      "curve-stableswap-ng.exact-input", "aave-v3.supply",
    ]);
    expect(selected?.balanceConstraints).toEqual([{
      kind: "minimumIncrease", token: usdt0.aToken.address.toLowerCase(), atomic: "998999",
    }]);
  });

  it("selects direct Aave or Uniswap when those are the best allowed lanes", () => {
    const directPolicy = CapabilityCompositionPolicyV1Schema.parse({ ...policy,
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }] });
    expect(selectCompositionCandidate(directPolicy, snapshot())?.actions)
      .toEqual([expect.objectContaining({ capabilityId: "aave-v3.supply" })]);

    const noCurve = CapabilityCompositionPolicyV1Schema.parse({ ...policy,
      allowedCapabilities: policy.allowedCapabilities.filter(({ id }) => !id.startsWith("curve")) });
    expect(selectCompositionCandidate(noCurve, snapshot())?.actions[0])
      .toMatchObject({ capabilityId: "uniswap-v3.exact-input" });
  });

  it("abstains from unregistered or non-positive routes", () => {
    const unsupported = CapabilityCompositionPolicyV1Schema.parse({ ...policy,
      allowedCapabilities: [{ id: "unknown.yield", version: 1 }],
      constraints: policy.constraints.map((constraint) =>
        constraint.kind === "minimum-registered-receipt-value"
          ? { ...constraint, receiptCapabilities: ["unknown.yield@1"] } : constraint),
      objective: { ...policy.objective, receiptCapabilities: ["unknown.yield@1"] },
    });
    expect(selectCompositionCandidate(unsupported, snapshot())).toBeUndefined();
    expect(selectCompositionCandidate(policy, snapshot(opportunities.map((item) =>
      item.kind === "aave-v3-supply" ? { ...item, supplyRateBps: 0 } : item))))
      .toBeUndefined();
  });
});
