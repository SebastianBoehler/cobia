import { describe, expect, it } from "vitest";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import { captureRouteSnapshotV2 } from "./capture-route-snapshot-v2";
import {
  block,
  dependencies,
  policy,
  uniswapQuote,
  usdg,
  usdt0,
} from "./capture-route-snapshot-v2.test-fixture";

describe("captureRouteSnapshotV2 atomic objectives", () => {
  it("captures the conservative return quote required by a Profit objective", async () => {
    const deps = dependencies();
    const profitPolicy = {
      ...policy,
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "profit" as const, minimumFinalAtomic: "100500000" },
    };
    deps.quoteExactInput.mockImplementation(async (input: {
      tokenIn: "USDG" | "USDt0";
      amountInAtomic: bigint;
    }) => ({
      ...uniswapQuote(input.amountInAtomic),
      tokenIn: input.tokenIn === "USDG" ? usdg : usdt0,
      tokenOut: input.tokenIn === "USDG" ? usdt0 : usdg,
      amountOutAtomic: input.tokenIn === "USDG" ? 101_000_000n : 100_500_000n,
    }));
    deps.quoteCurveExactInput.mockRejectedValue(new ProtocolIneligibleError(
      "curve-zero-liquidity", "Curve route is unavailable",
    ));

    const snapshot = await captureRouteSnapshotV2(profitPolicy, deps);

    expect(deps.quoteExactInput).toHaveBeenCalledWith({
      tokenIn: "USDG",
      tokenOut: "USDt0",
      amountInAtomic: 99_495_000n,
      block,
    });
    expect(snapshot.opportunities).toContainEqual(expect.objectContaining({
      kind: "uniswap-v3-exact-input",
      tokenIn: usdg.toLowerCase(),
      tokenOut: usdt0.toLowerCase(),
      quotedInputAtomic: "99495000",
      quotedOutputAtomic: "101000000",
    }));
  });
});
