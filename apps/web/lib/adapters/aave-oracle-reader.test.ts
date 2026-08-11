import { describe, expect, it } from "vitest";
import { readAaveOraclePrices } from "./aave-oracle-reader";
import { ADDRESSES, BLOCK_REFERENCE, ReaderTestClient, ZERO_ADDRESS } from "./reader.test-fixture";

function validClient() {
  const client = new ReaderTestClient();
  client.respond(ADDRESSES.aaveProvider, "getPriceOracle", [], ADDRESSES.aaveOracle);
  client.respond(ADDRESSES.aaveOracle, "BASE_CURRENCY", [], ZERO_ADDRESS);
  client.respond(ADDRESSES.aaveOracle, "BASE_CURRENCY_UNIT", [], 100_000_000n);
  client.respond(ADDRESSES.aaveOracle, "getAssetPrice", [ADDRESSES.usdg], 99_999_018n);
  client.respond(ADDRESSES.aaveOracle, "getAssetPrice", [ADDRESSES.usdt0], 99_912_234n);
  return client;
}

describe("readAaveOraclePrices", () => {
  it("returns positive registered-asset prices in canonical address order", async () => {
    await expect(readAaveOraclePrices(validClient(), { block: BLOCK_REFERENCE })).resolves.toEqual({
      adapterId: "aave-v3@1",
      registryHash: "0xa0c0ffbb2881447b778ddaabcfc1e3bfd93c42a9f591448cc289a6e316f9fc92",
      blockNumber: BLOCK_REFERENCE.number,
      blockHash: BLOCK_REFERENCE.hash,
      blockTimestamp: BLOCK_REFERENCE.timestamp,
      oracle: ADDRESSES.aaveOracle,
      baseCurrencyUnit: 100_000_000n,
      prices: [
        { asset: ADDRESSES.usdg, decimals: 6, priceUsdE8: 99_999_018n },
        { asset: ADDRESSES.usdt0, decimals: 6, priceUsdE8: 99_912_234n },
      ],
    });
  });

  it("rejects a provider oracle replacement", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aaveProvider, "getPriceOracle", [], ZERO_ADDRESS);
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "oracle identity mismatch",
    );
  });

  it("rejects changed oracle runtime bytecode", async () => {
    const client = validClient();
    client.codeHashes.set(ADDRESSES.aaveOracle.toLowerCase(), `0x${"01".repeat(32)}`);
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "runtime code hash mismatch",
    );
  });

  it.each([
    ["wrong", 10n ** 18n],
    ["malformed", "100000000"],
  ])("rejects a %s base currency unit", async (_, unit) => {
    const client = validClient();
    client.respond(ADDRESSES.aaveOracle, "BASE_CURRENCY_UNIT", [], unit);
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "base currency unit",
    );
  });

  it("rejects a non-USD base currency", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aaveOracle, "BASE_CURRENCY", [], ADDRESSES.usdg);
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "base currency must be the zero address",
    );
  });

  it.each([
    ["USDG", ADDRESSES.usdg],
    ["USDt0", ADDRESSES.usdt0],
  ])("rejects a zero %s price", async (_, asset) => {
    const client = validClient();
    client.respond(ADDRESSES.aaveOracle, "getAssetPrice", [asset], 0n);
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "positive",
    );
  });

  it("rejects a reorg after price collection", async () => {
    const client = validClient();
    client.blocks[1] = { ...BLOCK_REFERENCE, hash: `0x${"12".repeat(32)}` };
    await expect(readAaveOraclePrices(client, { block: BLOCK_REFERENCE })).rejects.toThrow(
      "block hash",
    );
  });
});
