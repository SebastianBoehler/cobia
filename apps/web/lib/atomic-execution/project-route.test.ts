import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { AAVE_POOL_SUPPLY_ABI } from "../execution-v2/abis";
import { NOW_SEC, usdt0 } from "../execution-v2/test-fixtures";
import { projectAtomicRouteV1 } from "./project-route";
import { verifiedAtomicFixture } from "./test-fixture";

const executor = "0x2222222222222222222222222222222222222222" as const;
const simulationHash = `0x${"52".repeat(32)}` as const;
const nonce = `0x${"53".repeat(32)}` as const;

describe("projectAtomicRouteV1", () => {
  it("projects a verified direct Aave route into exact bounded calldata", async () => {
    const fixture = await verifiedAtomicFixture();
    const projected = projectAtomicRouteV1({
      ...fixture,
      executor,
      simulationHash,
      nonce,
      nowSec: NOW_SEC,
    });

    expect(projected).toMatchObject({ executionChainId: 196, executor });
    expect(projected.route).toMatchObject({
      policyHash: fixture.bundle.policyHash,
      snapshotHash: fixture.bundle.snapshotHash,
      bundleHash: fixture.verdict.bundleHash,
      simulationHash,
      owner: fixture.policy.owner,
      inputToken: usdt0.toLowerCase(),
      inputAmount: 10_000_000n,
      nonce,
    });
    expect(projected.route.steps).toHaveLength(1);
    expect(projected.route.constraints).toEqual([{
      token: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address,
      account: fixture.policy.owner,
      minimumIncrease: 9_999_999n,
    }]);
    const decoded = decodeFunctionData({
      abi: AAVE_POOL_SUPPLY_ABI,
      data: projected.route.steps[0].data,
    });
    expect(decoded).toEqual({
      functionName: "supply",
      args: [usdt0, 10_000_000n, fixture.policy.owner, 0],
    });
  });

  it("rejects mismatched verified artifacts and unsafe projection fields", async () => {
    const fixture = await verifiedAtomicFixture();
    const base = {
      ...fixture,
      executor,
      simulationHash,
      nonce,
      nowSec: NOW_SEC,
    };
    const cases = [
      { ...base, policy: { ...fixture.policy, owner: executor } },
      { ...base, snapshot: { ...fixture.snapshot, blockNumber: "1" } },
      {
        ...base,
        bundle: {
          ...fixture.bundle,
          routePlan: { ...fixture.bundle.routePlan, retainedAtomic: "89999999" },
        },
      },
      { ...base, verdict: { ...fixture.verdict } },
      { ...base, executor: zeroAddress },
      { ...base, simulationHash: `0x${"00".repeat(32)}` },
      { ...base, nonce: `0x${"00".repeat(32)}` },
      { ...base, nowSec: fixture.bundle.validUntil },
      {
        ...base,
        policy: { ...fixture.policy, executionChainId: 1952 },
      },
    ];
    for (const candidate of cases) {
      expect(() => projectAtomicRouteV1(candidate as never)).toThrow();
    }
  });
});
