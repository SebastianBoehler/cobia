import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { captureRouteSnapshotV2 } from "./capture-route-snapshot-v2";
import {
  block,
  curveQuote,
  dependencies,
  policy,
  usdg,
  usdt0,
} from "./capture-route-snapshot-v2.test-fixture";

describe("captureRouteSnapshotV2 Curve venue", () => {
  it("captures Curve and Uniswap as competing exact-input routes", async () => {
    const deps = dependencies();
    const snapshot = await captureRouteSnapshotV2(policy, deps);

    expect(snapshot.opportunities).toContainEqual({
      id: `curve-stableswap-ng:${usdt0.toLowerCase()}:${usdg.toLowerCase()}:50000000`,
      kind: "curve-stableswap-ng-exact-input",
      adapterId: "curve-stableswap-ng@1",
      pool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address.toLowerCase(),
      tokenIn: usdt0.toLowerCase(),
      tokenOut: usdg.toLowerCase(),
      inputIndex: 1,
      outputIndex: 0,
      fee: "1000000",
      quotedInputAtomic: "50000000",
      quotedOutputAtomic: "50010000",
    });
    expect(deps.quoteCurveExactInput).toHaveBeenCalledWith({
      tokenIn: "USDt0",
      tokenOut: "USDG",
      amountInAtomic: 50_000_000n,
      block,
    });
    expect(deps.readReserve).toHaveBeenCalledWith({
      asset: "USDG",
      amountAtomic: curveQuote().amountOutAtomic * 9_900n / 10_000n,
      block,
    });
    expect(snapshot.opportunities.filter((opportunity) =>
      opportunity.kind === "aave-v3-supply" &&
      opportunity.asset.toLowerCase() === usdg.toLowerCase())).toHaveLength(2);
  });
});
