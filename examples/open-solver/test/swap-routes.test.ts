import { describe, expect, it } from "vitest";
import { selectDirectRoute, selectRoundTripRoute } from "../src/swap-routes";

describe("reference swap route selection", () => {
  it("selects the best direct protocol that clears the signed floor", () => {
    expect(selectDirectRoute([
      { protocol: "curve", amountInAtomic: 10_000_000n, amountOutAtomic: 9_980_000n },
      { protocol: "uniswap", amountInAtomic: 10_000_000n, amountOutAtomic: 10_010_000n },
    ], 9_950_000n)?.protocol).toBe("uniswap");
  });

  it("returns no round trip when every complete route loses principal", () => {
    expect(selectRoundTripRoute([
      { first: { protocol: "curve", amountInAtomic: 10_000_000n, amountOutAtomic: 10_005_000n },
        second: { protocol: "uniswap", amountInAtomic: 9_954_975n, amountOutAtomic: 9_949_000n } },
    ], 10_000_000n, 1n)).toBeUndefined();
  });

  it("selects the highest profitable complete round trip", () => {
    const selected = selectRoundTripRoute([
      { first: { protocol: "curve", amountInAtomic: 10_000_000n, amountOutAtomic: 10_100_000n },
        second: { protocol: "uniswap", amountInAtomic: 10_049_500n, amountOutAtomic: 10_020_000n } },
      { first: { protocol: "uniswap", amountInAtomic: 10_000_000n, amountOutAtomic: 10_110_000n },
        second: { protocol: "curve", amountInAtomic: 10_059_450n, amountOutAtomic: 10_030_000n } },
    ], 10_000_000n, 1n);
    expect(selected?.first.protocol).toBe("uniswap");
    expect(selected?.second.amountOutAtomic).toBe(10_030_000n);
  });
});
