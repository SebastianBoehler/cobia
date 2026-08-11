import { describe, expect, it } from "vitest";
import { ProtocolIneligibleError, type ProtocolIneligibleCode } from "./protocol-error";
import { quoteUniswapExactInputSingle } from "./uniswap-reader";
import {
  ADDRESSES,
  BLOCK_REFERENCE,
  implementationWord,
  ReaderTestClient,
  ZERO_ADDRESS,
} from "./reader.test-fixture";

const amountInAtomic = 1_000_000n;
const slot0 = [79_261_724_744_722_839_834_753_548_606n, 8, 0, 32, 32, 0, true] as const;
const quote = [1_000_747n, 79_261_000_000_000_000_000_000_000_000n, 2, 93_799n] as const;

function quoteArgs() {
  return [{
    tokenIn: ADDRESSES.usdg,
    tokenOut: ADDRESSES.usdt0,
    amountIn: amountInAtomic,
    fee: 100,
    sqrtPriceLimitX96: 0n,
  }];
}

function validClient() {
  const client = new ReaderTestClient();
  client.respond(ADDRESSES.uniFactory, "getPool", [ADDRESSES.usdg, ADDRESSES.usdt0, 100], ADDRESSES.uniPool);
  client.respond(ADDRESSES.uniPool, "factory", [], ADDRESSES.uniFactory);
  client.respond(ADDRESSES.uniPool, "token0", [], ADDRESSES.usdg);
  client.respond(ADDRESSES.uniPool, "token1", [], ADDRESSES.usdt0);
  client.respond(ADDRESSES.uniPool, "fee", [], 100);
  client.respond(ADDRESSES.uniPool, "liquidity", [], 386_699_051_266_367n);
  client.respond(ADDRESSES.uniPool, "slot0", [], slot0);
  client.respond(ADDRESSES.uniQuoter, "quoteExactInputSingle", quoteArgs(), quote);
  return client;
}

const input = {
  tokenIn: "USDG",
  tokenOut: "USDt0",
  amountInAtomic,
  block: BLOCK_REFERENCE,
} as const;

async function expectIneligible<T>(promise: Promise<T>, code: ProtocolIneligibleCode) {
  const error = await promise.then(
    () => new Error("expected protocol to be ineligible"),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProtocolIneligibleError);
  expect(error).toMatchObject({ code });
}

describe("quoteUniswapExactInputSingle", () => {
  it("returns a quote only after bracketing the pinned pool state", async () => {
    await expect(quoteUniswapExactInputSingle(validClient(), input)).resolves.toEqual({
      adapterId: "uniswap-v3@1",
      registryHash: "0xda032b6bb7d76dfbadbb438cc5a4f3061f7b17b33b0fb7769dcefb84b90308ad",
      blockNumber: BLOCK_REFERENCE.number,
      blockHash: BLOCK_REFERENCE.hash,
      blockTimestamp: BLOCK_REFERENCE.timestamp,
      tokenIn: ADDRESSES.usdg,
      tokenOut: ADDRESSES.usdt0,
      pool: ADDRESSES.uniPool,
      fee: 100,
      liquidity: 386_699_051_266_367n,
      amountInAtomic,
      amountOutAtomic: 1_000_747n,
      sqrtPriceX96After: 79_261_000_000_000_000_000_000_000_000n,
      initializedTicksCrossed: 2,
      gasEstimate: 93_799n,
    });
  });

  it.each([
    ["factory", ADDRESSES.uniFactory],
    ["quoter", ADDRESSES.uniQuoter],
    ["router", ADDRESSES.uniRouter],
    ["pool", ADDRESSES.uniPool],
    ["USDG proxy", ADDRESSES.usdg],
    ["USDG implementation", ADDRESSES.usdgImpl],
    ["USDt0 proxy", ADDRESSES.usdt0],
    ["USDt0 implementation", ADDRESSES.usdt0Impl],
  ])("rejects changed %s runtime bytecode", async (_, address) => {
    const client = validClient();
    client.codeHashes.set(address.toLowerCase(), `0x${"01".repeat(32)}`);
    await expect(quoteUniswapExactInputSingle(client, input)).rejects.toThrow(
      "runtime code hash mismatch",
    );
  });

  it.each([
    ["USDG", ADDRESSES.usdg, ADDRESSES.usdgImpl],
    ["USDt0", ADDRESSES.usdt0, ADDRESSES.usdt0Impl],
  ] as const)("rejects a changed %s implementation slot", async (_, proxy, implementation) => {
    const client = validClient();
    const wrong = implementation === ADDRESSES.usdgImpl ? ADDRESSES.usdt0Impl : ADDRESSES.usdgImpl;
    client.implementationSlots.set(proxy.toLowerCase(), implementationWord(wrong));
    await expect(quoteUniswapExactInputSingle(client, input)).rejects.toThrow(
      "implementation identity mismatch",
    );
  });

  it.each([
    ["factory lookup", ADDRESSES.uniFactory, "getPool", [ADDRESSES.usdg, ADDRESSES.usdt0, 100], ZERO_ADDRESS],
    ["pool factory", ADDRESSES.uniPool, "factory", [], ZERO_ADDRESS],
    ["token0", ADDRESSES.uniPool, "token0", [], ADDRESSES.usdt0],
    ["token1", ADDRESSES.uniPool, "token1", [], ADDRESSES.usdg],
    ["fee", ADDRESSES.uniPool, "fee", [], 500],
  ] as const)("rejects a broken %s identity", async (_, address, functionName, args, result) => {
    const client = validClient();
    client.respond(address, functionName, args, result);
    await expect(quoteUniswapExactInputSingle(client, input)).rejects.toThrow("identity mismatch");
  });

  it.each([
    ["zero liquidity", 0n, slot0, quote, "uniswap-zero-liquidity"],
    ["locked pool", 386_699_051_266_367n, [...slot0.slice(0, 6), false], quote, "uniswap-pool-locked"],
    ["zero output", 386_699_051_266_367n, slot0, [0n, quote[1], quote[2], quote[3]], "uniswap-zero-output"],
  ] as const)("marks %s ineligible", async (_, liquidity, changedSlot0, changedQuote, code) => {
    const client = validClient();
    client.respond(ADDRESSES.uniPool, "liquidity", [], liquidity);
    client.respond(ADDRESSES.uniPool, "slot0", [], changedSlot0);
    client.respond(ADDRESSES.uniQuoter, "quoteExactInputSingle", quoteArgs(), changedQuote);
    await expectIneligible(quoteUniswapExactInputSingle(client, input), code);
  });

  it("keeps malformed quote metrics fatal", async () => {
    const client = validClient();
    client.respond(ADDRESSES.uniPool, "liquidity", [], 0n);
    client.respond(ADDRESSES.uniQuoter, "quoteExactInputSingle", quoteArgs(), [quote[0], 0n, 2, 0n]);
    const error = await quoteUniswapExactInputSingle(client, input).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
    expect((error as Error).message).toContain("malformed execution metrics");
  });

  it("does not let zero liquidity mask a final block change", async () => {
    const client = validClient();
    client.respond(ADDRESSES.uniPool, "liquidity", [], 0n);
    client.blocks[1] = { ...BLOCK_REFERENCE, hash: `0x${"12".repeat(32)}` };
    const error = await quoteUniswapExactInputSingle(client, input).catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
    expect((error as Error).message).toContain("block hash");
  });

  it("rejects a reorg after quote collection", async () => {
    const client = validClient();
    client.blocks[1] = { ...BLOCK_REFERENCE, hash: `0x${"12".repeat(32)}` };
    await expect(quoteUniswapExactInputSingle(client, input)).rejects.toThrow("block hash");
  });
});
