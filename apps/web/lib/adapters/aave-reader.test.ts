import { describe, expect, it } from "vitest";
import { readAaveReserve } from "./aave-reader";
import { ProtocolIneligibleError, type ProtocolIneligibleCode } from "./protocol-error";
import {
  ADDRESSES,
  BLOCK_REFERENCE,
  implementationWord,
  ReaderTestClient,
  ZERO_ADDRESS,
} from "./reader.test-fixture";
const RAY = 10n ** 27n;
const configuration = [6n, 7_000n, 7_500n, 10_500n, 1_000n, true, true, false, true, false] as const;
const caps = [48_000_000n, 100_000_000n] as const;
const scaledTotalSupply = 52_451_785_769_860n;
const availableLiquidityAtomic = 40_840_667_193_993n;
const variableDebtToken = "0x1111111111111111111111111111111111111111" as const;
const reserveData = [
  0n,
  10_000_000n,
  52_976_308_667_161n,
  0n,
  12_137_371_187_303n,
  30_000_000_000_000_000_000_000_000n,
  0n,
  0n,
  0n,
  1_010_000_000_000_000_000_000_000_000n,
  1n,
  Number(BLOCK_REFERENCE.timestamp - 100n),
] as const;

type Asset = "USDG" | "USDt0";

function assetAddresses(asset: Asset) {
  return asset === "USDG"
    ? { underlying: ADDRESSES.usdg, aToken: ADDRESSES.aUsdg }
    : { underlying: ADDRESSES.usdt0, aToken: ADDRESSES.aUsdt0 };
}

function validClient(asset: Asset = "USDt0") {
  const client = new ReaderTestClient();
  const addresses = assetAddresses(asset);
  client.respond(ADDRESSES.aaveProvider, "getPool", [], ADDRESSES.aavePool);
  client.respond(ADDRESSES.aaveProvider, "getPoolDataProvider", [], ADDRESSES.aaveDataProvider);
  client.respond(ADDRESSES.aaveDataProvider, "ADDRESSES_PROVIDER", [], ADDRESSES.aaveProvider);
  client.respond(ADDRESSES.aaveDataProvider, "POOL", [], ADDRESSES.aavePool);
  client.respond(ADDRESSES.aaveDataProvider, "getReserveTokensAddresses", [addresses.underlying], [
    addresses.aToken,
    ZERO_ADDRESS,
    variableDebtToken,
  ]);
  client.respond(ADDRESSES.aaveDataProvider, "getReserveConfigurationData", [addresses.underlying], configuration);
  client.respond(ADDRESSES.aaveDataProvider, "getReserveCaps", [addresses.underlying], caps);
  client.respond(ADDRESSES.aaveDataProvider, "getPaused", [addresses.underlying], false);
  client.respond(ADDRESSES.aaveDataProvider, "getReserveData", [addresses.underlying], reserveData);
  client.respond(addresses.aToken, "POOL", [], ADDRESSES.aavePool);
  client.respond(addresses.aToken, "UNDERLYING_ASSET_ADDRESS", [], addresses.underlying);
  client.respond(addresses.aToken, "scaledTotalSupply", [], scaledTotalSupply);
  client.respond(addresses.underlying, "balanceOf", [addresses.aToken], availableLiquidityAtomic);
  return client;
}

function input(asset: Asset = "USDt0", amountAtomic = 1_000_000n) {
  return { asset, amountAtomic, block: BLOCK_REFERENCE } as const;
}

async function expectIneligible<T>(promise: Promise<T>, code: ProtocolIneligibleCode) {
  const error = await promise.then(
    () => new Error("expected protocol to be ineligible"),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProtocolIneligibleError);
  expect(error).toMatchObject({ code });
}

describe("readAaveReserve", () => {
  it("returns one block-committed, treasury-inclusive reserve state", async () => {
    await expect(readAaveReserve(validClient(), input())).resolves.toEqual({
      adapterId: "aave-v3@1",
      registryHash: "0xda032b6bb7d76dfbadbb438cc5a4f3061f7b17b33b0fb7769dcefb84b90308ad",
      blockNumber: BLOCK_REFERENCE.number,
      blockHash: BLOCK_REFERENCE.hash,
      blockTimestamp: BLOCK_REFERENCE.timestamp,
      asset: ADDRESSES.usdt0,
      aToken: ADDRESSES.aUsdt0,
      decimals: 6,
      ltvBps: 7_000n,
      liquidationThresholdBps: 7_500n,
      liquidationBonusBps: 10_500n,
      reserveFactorBps: 1_000n,
      collateralEnabled: true,
      borrowingEnabled: true,
      borrowCapWholeTokens: 48_000_000n,
      supplyCapWholeTokens: 100_000_000n,
      supplyHeadroomAtomic: 47_023_681_232_838n,
      totalATokenAtomic: 52_976_308_667_161n,
      availableLiquidityAtomic,
      scaledTotalSupply,
      scaledSupplyAmount: 990_098n,
      validatedSupplyAtomic: 1_000_000n,
      accruedToTreasuryScaled: 10_000_000n,
      pendingTreasuryAtomic: 10_100_000n,
      nextLiquidityIndexRay: 1_010_000_096_080_669_710_806_697_107n,
      capUsageAfterAtomic: 52_976_319_767_161n,
      totalStableDebtAtomic: 0n,
      totalVariableDebtAtomic: 12_137_371_187_303n,
      liquidityRateRay: 30_000_000_000_000_000_000_000_000n,
    });
  });

  it.each([
    ["provider", "USDt0", ADDRESSES.aaveProvider],
    ["pool proxy", "USDt0", ADDRESSES.aavePool],
    ["pool implementation", "USDt0", ADDRESSES.aavePoolImpl],
    ["data provider", "USDt0", ADDRESSES.aaveDataProvider],
    ["USDt0 proxy", "USDt0", ADDRESSES.usdt0],
    ["USDt0 implementation", "USDt0", ADDRESSES.usdt0Impl],
    ["aUSDt0 proxy", "USDt0", ADDRESSES.aUsdt0],
    ["aToken implementation", "USDt0", ADDRESSES.aTokenImpl],
    ["USDG proxy", "USDG", ADDRESSES.usdg],
    ["USDG implementation", "USDG", ADDRESSES.usdgImpl],
    ["aUSDG proxy", "USDG", ADDRESSES.aUsdg],
  ] as const)("rejects changed %s runtime bytecode", async (_, asset, address) => {
    const client = validClient(asset);
    client.codeHashes.set(address.toLowerCase(), `0x${"01".repeat(32)}`);
    await expect(readAaveReserve(client, input(asset))).rejects.toThrow(
      "runtime code hash mismatch",
    );
  });

  it.each([
    ["pool", "USDt0", ADDRESSES.aavePool, ADDRESSES.aavePoolImpl],
    ["USDt0", "USDt0", ADDRESSES.usdt0, ADDRESSES.usdt0Impl],
    ["aUSDt0", "USDt0", ADDRESSES.aUsdt0, ADDRESSES.aTokenImpl],
    ["USDG", "USDG", ADDRESSES.usdg, ADDRESSES.usdgImpl],
    ["aUSDG", "USDG", ADDRESSES.aUsdg, ADDRESSES.aTokenImpl],
  ] as const)("rejects a changed %s implementation slot", async (_, asset, proxy, implementation) => {
    const client = validClient(asset);
    const wrong = implementation === ADDRESSES.aavePoolImpl ? ADDRESSES.aTokenImpl : ADDRESSES.aavePoolImpl;
    client.implementationSlots.set(proxy.toLowerCase(), implementationWord(wrong));
    await expect(readAaveReserve(client, input(asset))).rejects.toThrow(
      "implementation identity mismatch",
    );
  });

  it.each([
    ["provider pool", ADDRESSES.aaveProvider, "getPool", [], ZERO_ADDRESS],
    ["provider data provider", ADDRESSES.aaveProvider, "getPoolDataProvider", [], ZERO_ADDRESS],
    ["data provider owner", ADDRESSES.aaveDataProvider, "ADDRESSES_PROVIDER", [], ZERO_ADDRESS],
    ["data provider pool", ADDRESSES.aaveDataProvider, "POOL", [], ZERO_ADDRESS],
    ["aToken pool", ADDRESSES.aUsdt0, "POOL", [], ZERO_ADDRESS],
    ["aToken underlying", ADDRESSES.aUsdt0, "UNDERLYING_ASSET_ADDRESS", [], ADDRESSES.usdg],
  ] as const)("rejects a broken %s cross-link", async (_, address, functionName, args, result) => {
    const client = validClient();
    client.respond(address, functionName, args, result);
    const error = await readAaveReserve(client, input()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
    expect((error as Error).message).toContain("identity mismatch");
  });

  it.each([
    ["inactive", [...configuration.slice(0, 8), false, false], false, "aave-reserve-inactive"],
    ["frozen", [...configuration.slice(0, 8), true, true], false, "aave-reserve-frozen"],
    ["paused", configuration, true, "aave-reserve-paused"],
  ] as const)("marks an %s reserve ineligible", async (_, changed, paused, code) => {
    const client = validClient();
    client.respond(ADDRESSES.aaveDataProvider, "getReserveConfigurationData", [ADDRESSES.usdt0], changed);
    client.respond(ADDRESSES.aaveDataProvider, "getPaused", [ADDRESSES.usdt0], paused);
    await expectIneligible(readAaveReserve(client, input()), code);
  });

  it("counts pending treasury at the exact supply-cap boundary", async () => {
    const client = validClient();
    const boundary: Array<bigint | number> = [...reserveData];
    boundary[1] = 1_000_000n;
    boundary[2] = 98_000_000n;
    boundary[5] = 0n;
    boundary[9] = RAY;
    boundary[11] = Number(BLOCK_REFERENCE.timestamp);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveCaps", [ADDRESSES.usdt0], [1n, 100n]);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveData", [ADDRESSES.usdt0], boundary);
    client.respond(ADDRESSES.aUsdt0, "scaledTotalSupply", [], 98_000_000n);

    await expect(readAaveReserve(client, input())).resolves.toMatchObject({
      pendingTreasuryAtomic: 1_000_000n,
      supplyHeadroomAtomic: 1_000_000n,
    });
  });

  it("rejects one atomic unit beyond the treasury-inclusive cap", async () => {
    const client = validClient();
    const over: Array<bigint | number> = [...reserveData];
    over[1] = 1_000_001n;
    over[2] = 98_000_000n;
    over[5] = 0n;
    over[9] = RAY;
    over[11] = Number(BLOCK_REFERENCE.timestamp);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveCaps", [ADDRESSES.usdt0], [1n, 100n]);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveData", [ADDRESSES.usdt0], over);
    client.respond(ADDRESSES.aUsdt0, "scaledTotalSupply", [], 98_000_000n);

    await expectIneligible(readAaveReserve(client, input()), "aave-supply-cap-exceeded");
  });

  it("keeps borrow cap informational for a valid supply", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aaveDataProvider, "getReserveCaps", [ADDRESSES.usdt0], [
      12_137_371n,
      100_000_000n,
    ]);
    await expect(readAaveReserve(client, input())).resolves.toMatchObject({
      borrowCapWholeTokens: 12_137_371n,
      totalVariableDebtAtomic: 12_137_371_187_303n,
    });
  });

  it("rejects a live-shaped one-atomic input that scales to zero", async () => {
    await expectIneligible(
      readAaveReserve(validClient(), input("USDt0", 1n)),
      "aave-zero-scaled-amount",
    );
  });

  it("rejects an aggregate fractional carry beyond the cap", async () => {
    const client = validClient();
    const carry: Array<bigint | number> = [...reserveData];
    carry[1] = 414_937n;
    carry[2] = 98_797_663n;
    carry[5] = 0n;
    carry[9] = 1_010_000_000_000_000_000_000_000_000n;
    carry[11] = Number(BLOCK_REFERENCE.timestamp);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveCaps", [ADDRESSES.usdt0], [1n, 100n]);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveData", [ADDRESSES.usdt0], carry);
    client.respond(ADDRESSES.aUsdt0, "scaledTotalSupply", [], 97_819_469n);

    await expectIneligible(
      readAaveReserve(client, input("USDt0", 783_251n)),
      "aave-supply-cap-exceeded",
    );
  });

  it("propagates an RPC failure as an ordinary fatal error", async () => {
    const client = validClient();
    const rpcError = new Error("RPC unavailable");
    client.getChainId = async () => { throw rpcError; };
    const error = await readAaveReserve(client, input()).catch((reason: unknown) => reason);
    expect(error).toBe(rpcError);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
  });
  it("does not let inactive state mask malformed reserve data", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aaveDataProvider, "getReserveConfigurationData", [ADDRESSES.usdt0], [...configuration.slice(0, 8), false, false]);
    client.respond(ADDRESSES.aaveDataProvider, "getReserveData", [ADDRESSES.usdt0], []);
    const error = await readAaveReserve(client, input()).catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
    expect((error as Error).message).toContain("reserve data");
  });

  it("does not let inactive state mask a final block change", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aaveDataProvider, "getReserveConfigurationData", [ADDRESSES.usdt0], [...configuration.slice(0, 8), false, false]);
    client.blocks[1] = { ...BLOCK_REFERENCE, hash: `0x${"12".repeat(32)}` };
    const error = await readAaveReserve(client, input()).catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(ProtocolIneligibleError);
    expect((error as Error).message).toContain("block hash");
  });

  it("reports zero observed liquidity without gating a valid supply", async () => {
    const client = validClient();
    client.respond(ADDRESSES.usdt0, "balanceOf", [ADDRESSES.aUsdt0], 0n);
    await expect(readAaveReserve(client, input())).resolves.toMatchObject({
      availableLiquidityAtomic: 0n,
    });
  });

  it("rejects malformed observed liquidity", async () => {
    const client = validClient();
    client.respond(ADDRESSES.usdt0, "balanceOf", [ADDRESSES.aUsdt0], "40840667193993");
    await expect(readAaveReserve(client, input())).rejects.toThrow("available liquidity");
  });

  it("rejects an inconsistent scaled and total aToken supply", async () => {
    const client = validClient();
    client.respond(ADDRESSES.aUsdt0, "scaledTotalSupply", [], scaledTotalSupply + 1n);
    await expect(readAaveReserve(client, input())).rejects.toThrow(
      "scaled total supply does not match",
    );
  });

  it.each([
    ["initial hash", 0, { hash: `0x${"12".repeat(32)}` }, "block hash"],
    ["final hash", 1, { hash: `0x${"12".repeat(32)}` }, "block hash"],
    ["final timestamp", 1, { timestamp: BLOCK_REFERENCE.timestamp + 1n }, "timestamp"],
  ] as const)("rejects a changed %s", async (_, index, change, message) => {
    const client = validClient();
    client.blocks[index] = { ...BLOCK_REFERENCE, ...change };
    await expect(readAaveReserve(client, input())).rejects.toThrow(message);
  });
});
