import { isAddressEqual, zeroAddress, type Address } from "viem";
import { AAVE_ADDRESSES_PROVIDER_ABI, AAVE_ORACLE_ABI } from "./abis";
import {
  assertChainId,
  assertPinnedBlock,
  assertRuntimeCode,
  expectAddress,
  expectBigInt,
  type BlockReference,
  type ProtocolReadClient,
} from "./read-client";
import { PROTOCOL_REGISTRY, registryHash } from "./registry";

const BASE_CURRENCY_UNIT = 100_000_000n;

export interface AaveOracleSnapshot {
  adapterId: "aave-v3@1";
  registryHash: typeof registryHash;
  blockNumber: bigint;
  blockHash: BlockReference["hash"];
  blockTimestamp: bigint;
  oracle: Address;
  baseCurrencyUnit: typeof BASE_CURRENCY_UNIT;
  prices: Array<{
    asset: Address;
    decimals: 6;
    priceUsdE8: bigint;
  }>;
}

function read(
  client: ProtocolReadClient,
  address: Address,
  abi: Parameters<ProtocolReadClient["readContract"]>[0]["abi"],
  functionName: string,
  blockNumber: bigint,
  args?: readonly unknown[],
) {
  return client.readContract({ address, abi, functionName, args, blockNumber });
}

export async function readAaveOraclePrices(
  client: ProtocolReadClient,
  input: { block: BlockReference },
): Promise<AaveOracleSnapshot> {
  const registry = PROTOCOL_REGISTRY.aaveV3;
  const provider = registry.addressesProvider.address;
  const oracle = registry.oracle.address;
  const block = input.block;
  const assets = Object.values(registry.assets)
    .map(({ underlying, decimals }) => ({ asset: underlying.address, decimals }))
    .sort((left, right) => left.asset.toLowerCase() < right.asset.toLowerCase() ? -1 : 1);

  await assertChainId(client, PROTOCOL_REGISTRY.chainId);
  await assertPinnedBlock(client, block);
  await Promise.all([
    assertRuntimeCode(client, registry.addressesProvider, "Aave addresses provider", block.number),
    assertRuntimeCode(client, registry.oracle, "Aave oracle", block.number),
  ]);
  const [providerOracleRaw, baseCurrencyRaw, baseUnitRaw, ...priceValues] = await Promise.all([
    read(client, provider, AAVE_ADDRESSES_PROVIDER_ABI, "getPriceOracle", block.number),
    read(client, oracle, AAVE_ORACLE_ABI, "BASE_CURRENCY", block.number),
    read(client, oracle, AAVE_ORACLE_ABI, "BASE_CURRENCY_UNIT", block.number),
    ...assets.map(({ asset }) =>
      read(client, oracle, AAVE_ORACLE_ABI, "getAssetPrice", block.number, [asset])),
  ]);

  const providerOracle = expectAddress(providerOracleRaw, "Aave provider oracle");
  if (!isAddressEqual(providerOracle, oracle)) throw new Error("Aave oracle identity mismatch");
  const baseCurrency = expectAddress(baseCurrencyRaw, "Aave base currency");
  if (!isAddressEqual(baseCurrency, zeroAddress)) {
    throw new Error("Aave base currency must be the zero address for USD prices");
  }
  const baseCurrencyUnit = expectBigInt(baseUnitRaw, "Aave base currency unit");
  if (baseCurrencyUnit !== BASE_CURRENCY_UNIT) {
    throw new Error("Aave base currency unit must equal 1e8");
  }
  const prices = assets.map(({ asset, decimals }, index) => {
    const priceUsdE8 = expectBigInt(priceValues[index], `Aave ${asset} price`);
    if (priceUsdE8 <= 0n) throw new Error(`Aave ${asset} price must be positive`);
    return { asset, decimals, priceUsdE8 };
  });
  await assertPinnedBlock(client, block);

  return {
    adapterId: registry.adapterId,
    registryHash,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    oracle,
    baseCurrencyUnit: BASE_CURRENCY_UNIT,
    prices,
  };
}
