import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import {
  CURVE_LIQUIDITY_ABI,
  buildCurveAddLiquidityStage,
  buildCurveRemoveOneCoinStage,
} from "../src/curve-liquidity-strategy";

const owner = "0x1111111111111111111111111111111111111111" as const;
const pool = PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address.toLowerCase();
const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address;

describe("Curve StableSwap NG liquidity actions", () => {
  it("adds one exact registered coin with an owner LP-token floor", () => {
    const built = buildCurveAddLiquidityStage({ stageId: "01-curve-add", owner,
      inputToken: usdg, inputAtomic: "100", minimumLpAtomic: "95",
      fetchedAt: 100, expiresAt: 130 });
    const decoded = decodeFunctionData({ abi: CURVE_LIQUIDITY_ABI,
      data: built.payload.transaction.data });

    expect(decoded).toEqual({ functionName: "add_liquidity",
      args: [[100n, 0n], 95n, owner] });
    expect(built.stage).toMatchObject({ input: { token: usdg.toLowerCase(), atomic: "100" },
      output: { token: pool, minimumAtomic: "95" }, recipient: owner,
      approval: { token: usdg.toLowerCase(), spender: pool, maximumAtomic: "100" },
      transaction: { target: pool, valueAtomic: "0" } });
  });

  it("burns an exact LP amount for one registered coin sent to the owner", () => {
    const built = buildCurveRemoveOneCoinStage({ stageId: "01-curve-remove", owner,
      outputToken: usdt0, lpAtomic: "100", minimumOutputAtomic: "90",
      fetchedAt: 100, expiresAt: 130 });
    const decoded = decodeFunctionData({ abi: CURVE_LIQUIDITY_ABI,
      data: built.payload.transaction.data });

    expect(decoded).toEqual({ functionName: "remove_liquidity_one_coin",
      args: [100n, 1n, 90n, owner] });
    expect(built.stage).toMatchObject({ input: { token: pool, atomic: "100" },
      output: { token: usdt0.toLowerCase(), minimumAtomic: "90" }, recipient: owner });
    expect(built.stage).not.toHaveProperty("approval");
  });

  it("rejects a coin outside the pinned pool", () => {
    expect(() => buildCurveAddLiquidityStage({ stageId: "01-curve-add", owner,
      inputToken: "0x9999999999999999999999999999999999999999", inputAtomic: "100",
      minimumLpAtomic: "95", fetchedAt: 100, expiresAt: 130 })).toThrow(/registered coin/i);
  });
});
