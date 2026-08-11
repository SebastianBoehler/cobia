import { describe, expect, it } from "vitest";
import { readUniswapFullRangeState } from "./uniswap-lp-reader";
import {
  ADDRESSES,
  BLOCK_REFERENCE,
  ReaderTestClient,
} from "./reader.test-fixture";

const Q128 = 2n ** 128n;
const previousBlock = {
  number: BLOCK_REFERENCE.number - 86_400n,
  hash: `0x${"12".repeat(32)}` as const,
  timestamp: BLOCK_REFERENCE.timestamp - 86_400n,
};
const slot0 = [2n ** 96n, 0, 0, 32, 32, 0, true] as const;

function validClient() {
  const client = new ReaderTestClient();
  client.addBlock(previousBlock);
  client.respond(ADDRESSES.uniFactory, "getPool", [ADDRESSES.usdg, ADDRESSES.usdt0, 100], ADDRESSES.uniPool);
  client.respond(ADDRESSES.uniPool, "factory", [], ADDRESSES.uniFactory);
  client.respond(ADDRESSES.uniPool, "token0", [], ADDRESSES.usdg);
  client.respond(ADDRESSES.uniPool, "token1", [], ADDRESSES.usdt0);
  client.respond(ADDRESSES.uniPool, "fee", [], 100);
  client.respond(ADDRESSES.uniPool, "tickSpacing", [], 1);
  client.respond(ADDRESSES.uniPool, "liquidity", [], 386_699_051_266_367n);
  client.respond(ADDRESSES.usdg, "balanceOf", [ADDRESSES.uniPool], 788_328_720_464n);
  client.respond(ADDRESSES.usdt0, "balanceOf", [ADDRESSES.uniPool], 1_154_466_443_516n);
  client.respond(ADDRESSES.uniPool, "slot0", [], slot0);
  client.respond(ADDRESSES.uniPool, "feeGrowthGlobal0X128", [], Q128 / 10_000n);
  client.respond(ADDRESSES.uniPool, "feeGrowthGlobal1X128", [], Q128 / 20_000n);
  client.respondAt(previousBlock.number, ADDRESSES.uniPool, "feeGrowthGlobal0X128", [], 0n);
  client.respondAt(previousBlock.number, ADDRESSES.uniPool, "feeGrowthGlobal1X128", [], 0n);
  client.respond(ADDRESSES.uniPositionManager, "factory", [], ADDRESSES.uniFactory);
  return client;
}

describe("readUniswapFullRangeState", () => {
  it("pins the official position manager and returns block-bounded fee growth", async () => {
    await expect(readUniswapFullRangeState(validClient(), {
      block: BLOCK_REFERENCE,
      lookbackBlock: previousBlock,
    })).resolves.toEqual({
      adapterId: "uniswap-v3@1",
      registryHash: "0x57f9c21f0c77f4eb38455d3ab9d21f1c7780adddd99adaa53834d4937a2ea988",
      blockNumber: BLOCK_REFERENCE.number,
      blockHash: BLOCK_REFERENCE.hash,
      blockTimestamp: BLOCK_REFERENCE.timestamp,
      pool: ADDRESSES.uniPool,
      positionManager: ADDRESSES.uniPositionManager,
      token0: ADDRESSES.usdg,
      token1: ADDRESSES.usdt0,
      fee: 100,
      tickSpacing: 1,
      tickLower: -887272,
      tickUpper: 887272,
      sqrtPriceX96: 2n ** 96n,
      tick: 0,
      liquidity: 386_699_051_266_367n,
      reserve0Atomic: 788_328_720_464n,
      reserve1Atomic: 1_154_466_443_516n,
      feeGrowth0DeltaX128: Q128 / 10_000n,
      feeGrowth1DeltaX128: Q128 / 20_000n,
      lookbackSeconds: 86_400n,
    });
  });

  it("rejects changed position-manager code and inverted history", async () => {
    const changed = validClient();
    changed.codeHashes.set(ADDRESSES.uniPositionManager.toLowerCase(), `0x${"ef".repeat(32)}`);
    await expect(readUniswapFullRangeState(changed, {
      block: BLOCK_REFERENCE,
      lookbackBlock: previousBlock,
    })).rejects.toThrow("runtime code hash mismatch");

    await expect(readUniswapFullRangeState(validClient(), {
      block: previousBlock,
      lookbackBlock: BLOCK_REFERENCE,
    })).rejects.toThrow("lookback");
  });
});
