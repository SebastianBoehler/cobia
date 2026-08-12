import { decodeFunctionData, isAddressEqual, keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { createRepositoryFixtureV2 } from "../db/repository-test-fixtures";
import { AAVE_POOL_SUPPLY_ABI, CURVE_STABLESWAP_NG_EXCHANGE_ABI, SWAP_ROUTER02_ABI } from "../execution-v2/abis";
import { projectAtomicRouteV1 } from "./project-route";

const EXECUTOR = "0x2222222222222222222222222222222222222222" as const;
const SIMULATION = `0x${"51".repeat(32)}` as const;
const NONCE = `0x${"52".repeat(32)}` as const;

async function fixture() {
  return createRepositoryFixtureV2({
    principalAtomic: "10000000",
    protocolExposureBps: 10_000,
    preferredRoute: "direct",
  });
}

describe("atomic route projection", () => {
  it("projects one direct Aave supply with an owner aToken lower bound", async () => {
    const value = await fixture();
    const route = projectAtomicRouteV1({
      ...value,
      executor: EXECUTOR,
      simulationHash: SIMULATION,
      nonce: NONCE,
      nowSec: 1_783_238_460,
    });

    expect(route.inputAmount).toBe(10_000_000n);
    expect(route.steps).toHaveLength(1);
    expect(route.steps[0]).toMatchObject({
      adapterId: keccak256(toBytes("aave-v3@1")),
      target: PROTOCOL_REGISTRY.aaveV3.pool.address,
      spendAmount: 10_000_000n,
    });
    const decoded = decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: route.steps[0]!.data });
    expect(decoded.args).toEqual([
      PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
      10_000_000n,
      value.policy.owner,
      0,
    ]);
    expect(route.constraints[0]).toMatchObject({
      token: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address,
      minimumIncrease: 9_999_999n,
    });
    expect(isAddressEqual(route.constraints[0]!.account, value.policy.owner)).toBe(true);
  });

  it.each(["uniswap", "curve"] as const)(
    "keeps the %s swap output inside the executor before bounded Aave supply",
    async (venue) => {
      const value = await createRepositoryFixtureV2({
        principalAtomic: "10000000",
        protocolExposureBps: 10_000,
        preferredRoute: venue,
      });
      const route = projectAtomicRouteV1({
        ...value,
        executor: EXECUTOR,
        simulationHash: SIMULATION,
        nonce: NONCE,
        nowSec: 1_783_238_460,
      });

      expect(route.steps).toHaveLength(2);
      expect(route.steps[1]?.spendAmount).toBe(9_900_000n);
      if (venue === "uniswap") {
        const decoded = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: route.steps[0]!.data });
        expect(decoded.functionName).toBe("exactInputSingle");
        if (decoded.functionName !== "exactInputSingle") throw new Error("Expected exactInputSingle");
        expect(decoded.args[0].recipient).toBe(EXECUTOR);
        expect(decoded.args[0].amountOutMinimum).toBe(9_900_000n);
      } else {
        const decoded = decodeFunctionData({
          abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
          data: route.steps[0]!.data,
        });
        expect(isAddressEqual(decoded.args[4], EXECUTOR)).toBe(true);
      }
      const supply = decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: route.steps[1]!.data });
      expect(supply.args[1]).toBe(9_900_000n);
      expect(isAddressEqual(supply.args[2], value.policy.owner)).toBe(true);
    },
  );

  it("rejects a route above the immutable beta cap", async () => {
    const value = await createRepositoryFixtureV2();
    expect(() => projectAtomicRouteV1({
      ...value,
      executor: EXECUTOR,
      simulationHash: SIMULATION,
      nonce: NONCE,
      nowSec: 1_783_238_460,
    })).toThrow("10 USD beta cap");
  });
});
