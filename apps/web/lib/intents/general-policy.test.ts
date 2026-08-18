import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { USDG_ADDRESS } from "../chain/xlayer";
import { USDT_ADDRESS } from "../chain/supported-assets";
import { buildGeneralIntentPolicyV1 } from "./general-policy";

const common = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111" as const,
  inputToken: USDG_ADDRESS,
  inputAtomic: "10000000",
  nonce: `0x${"11".repeat(32)}` as const,
  nowSec: 2_000_000_000,
};

describe("general onchain policy builder", () => {
  it("builds an exact Aave receipt outcome for Earn", () => {
    const policy = buildGeneralIntentPolicyV1({ ...common, mode: "Earn", exposureBps: 10_000 });

    expect(policy).toMatchObject({
      kind: "general-onchain",
      executionChainId: 196,
      manifestHash: registryHash,
      input: { token: USDG_ADDRESS.toLowerCase(), maxAtomic: "10000000" },
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
      balanceConstraints: [{
        kind: "minimumIncrease",
        token: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address.toLowerCase(),
        atomic: "9950000",
      }],
      objective: { kind: "satisfy" },
    });
  });

  it("builds protocol-neutral hard outputs for Swap and Profit", () => {
    const swap = buildGeneralIntentPolicyV1({
      ...common, mode: "Swap", outputToken: USDT_ADDRESS, minimumOutputAtomic: "9950000",
    });
    const profit = buildGeneralIntentPolicyV1({ ...common, mode: "Profit", minimumProfitAtomic: "10000" });

    expect(swap.allowedCapabilities.map(({ id }) => id)).toEqual([
      "curve-stableswap-ng.exact-input", "uniswap-v3.exact-input",
    ]);
    expect(swap.balanceConstraints).toEqual([{
      kind: "minimumIncrease", token: USDT_ADDRESS.toLowerCase(), atomic: "9950000",
    }]);
    expect(profit.balanceConstraints).toEqual([{
      kind: "minimumIncrease", token: USDG_ADDRESS.toLowerCase(), atomic: "10000",
    }]);
    expect(profit.limits.maxActions).toBe(2);
  });

  it("rejects zero exposure or a same-asset swap", () => {
    expect(() => buildGeneralIntentPolicyV1({ ...common, mode: "Earn", exposureBps: 0 })).toThrow(/exposure/i);
    expect(() => buildGeneralIntentPolicyV1({
      ...common, mode: "Swap", outputToken: USDG_ADDRESS, minimumOutputAtomic: "1",
    })).toThrow(/different/i);
  });
});
