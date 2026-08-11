import { describe, expect, it } from "vitest";
import { ADDRESSES, BLOCK_REFERENCE, ReaderTestClient } from "./reader.test-fixture";
import { quoteCurveStableSwapNg } from "./curve-reader";

function client() {
  const read = new ReaderTestClient();
  read.respond(ADDRESSES.curveFactory, "views_implementation", [], ADDRESSES.curveViews);
  read.respond(ADDRESSES.curveFactory, "get_implementation_address", [ADDRESSES.curvePool], ADDRESSES.curvePlainImplementation);
  read.respond(ADDRESSES.curveFactory, "get_coins", [ADDRESSES.curvePool], [ADDRESSES.usdg, ADDRESSES.usdt0]);
  read.respond(ADDRESSES.curveFactory, "get_decimals", [ADDRESSES.curvePool], [6n, 6n]);
  read.respond(ADDRESSES.curvePool, "fee", [], 1_000_000n);
  read.respond(ADDRESSES.curvePool, "A", [], 2_000n);
  read.respond(ADDRESSES.curvePool, "balances", [0n], 257_413_498_021n);
  read.respond(ADDRESSES.curvePool, "balances", [1n], 743_393_436_552n);
  read.respond(ADDRESSES.curvePool, "totalSupply", [], 1_000_002_049_432_912_529_217_488n);
  read.respond(ADDRESSES.curvePool, "get_virtual_price", [], 1_000_727_740_125_638_893n);
  read.respond(ADDRESSES.curvePool, "get_dy", [0n, 1n, 10_000_000n], 10_007_038n);
  return read;
}

describe("Curve StableSwap NG exact-input reader", () => {
  it("pins the official factory-owned USDG/USDt0 pool and exact quote", async () => {
    await expect(quoteCurveStableSwapNg(client(), {
      tokenIn: "USDG", tokenOut: "USDt0", amountInAtomic: 10_000_000n,
      block: BLOCK_REFERENCE,
    })).resolves.toMatchObject({
      adapterId: "curve-stableswap-ng@1",
      pool: ADDRESSES.curvePool,
      tokenIn: ADDRESSES.usdg,
      tokenOut: ADDRESSES.usdt0,
      inputIndex: 0,
      outputIndex: 1,
      amountInAtomic: 10_000_000n,
      amountOutAtomic: 10_007_038n,
      fee: 1_000_000n,
      amplification: 2_000n,
      balances: [257_413_498_021n, 743_393_436_552n],
    });
  });

  it.each([
    ["factory pool identity", ADDRESSES.curveFactory, "get_coins", [ADDRESSES.curvePool], [ADDRESSES.usdt0, ADDRESSES.usdg]],
    ["views identity", ADDRESSES.curveFactory, "views_implementation", [], ADDRESSES.uniQuoter],
    ["pool fee", ADDRESSES.curvePool, "fee", [], 2_000_000n],
    ["zero output", ADDRESSES.curvePool, "get_dy", [0n, 1n, 10_000_000n], 0n],
  ])("rejects mutated %s", async (_, address, fn, args, value) => {
    const read = client();
    read.respond(address, fn, args, value);
    await expect(quoteCurveStableSwapNg(read, {
      tokenIn: "USDG", tokenOut: "USDt0", amountInAtomic: 10_000_000n,
      block: BLOCK_REFERENCE,
    })).rejects.toThrow();
  });

  it("rejects a final-block reorg before classifying zero output", async () => {
    const read = client();
    read.respond(ADDRESSES.curvePool, "get_dy", [0n, 1n, 10_000_000n], 0n);
    read.blocks[1] = { ...BLOCK_REFERENCE, hash: `0x${"99".repeat(32)}` };
    await expect(quoteCurveStableSwapNg(read, {
      tokenIn: "USDG", tokenOut: "USDt0", amountInAtomic: 10_000_000n,
      block: BLOCK_REFERENCE,
    })).rejects.toThrow("block hash");
  });
});
