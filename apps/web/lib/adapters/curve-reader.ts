import { isAddressEqual, type Address } from "viem";
import {
  CURVE_STABLESWAP_NG_FACTORY_ABI,
  CURVE_STABLESWAP_NG_POOL_READ_ABI,
} from "./abis";
import { ProtocolIneligibleError } from "./protocol-error";
import {
  assertChainId,
  assertPinnedBlock,
  assertRuntimeCode,
  expectAddress,
  expectBigInt,
  expectTuple,
  type BlockReference,
  type ProtocolReadClient,
} from "./read-client";
import { PROTOCOL_REGISTRY, registryHash, type RegistryAsset } from "./registry";

export interface CurveStableSwapNgQuote {
  adapterId: "curve-stableswap-ng@1";
  registryHash: typeof registryHash;
  blockNumber: bigint;
  blockHash: BlockReference["hash"];
  blockTimestamp: bigint;
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  inputIndex: 0 | 1;
  outputIndex: 0 | 1;
  amountInAtomic: bigint;
  amountOutAtomic: bigint;
  fee: bigint;
  amplification: bigint;
  balances: readonly [bigint, bigint];
  totalSupply: bigint;
  virtualPrice: bigint;
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

export async function quoteCurveStableSwapNg(
  client: ProtocolReadClient,
  input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  },
): Promise<CurveStableSwapNgQuote> {
  if (input.tokenIn === input.tokenOut || input.amountInAtomic <= 0n) {
    throw new Error("Curve quote requires different assets and positive input");
  }
  const registry = PROTOCOL_REGISTRY.curveStableSwapNg;
  const token0 = PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token0].underlying;
  const token1 = PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token1].underlying;
  const inputIndex = input.tokenIn === registry.pair.token0 ? 0 : 1;
  const outputIndex = inputIndex === 0 ? 1 : 0;
  const tokenIn = inputIndex === 0 ? token0 : token1;
  const tokenOut = outputIndex === 0 ? token0 : token1;

  await assertChainId(client, PROTOCOL_REGISTRY.chainId);
  await assertPinnedBlock(client, input.block);
  await Promise.all([
    assertRuntimeCode(client, registry.factory, "Curve factory", input.block.number),
    assertRuntimeCode(client, registry.views, "Curve views", input.block.number),
    assertRuntimeCode(client, registry.plainImplementation, "Curve plain implementation", input.block.number),
    assertRuntimeCode(client, registry.pair.pool, "Curve pool", input.block.number),
    assertRuntimeCode(client, token0, "Curve token0", input.block.number),
    assertRuntimeCode(client, token1, "Curve token1", input.block.number),
  ]);
  const factory = registry.factory.address;
  const pool = registry.pair.pool.address;
  const [viewsRaw, implementationRaw, coinsRaw, decimalsRaw, feeRaw, amplificationRaw,
    balance0Raw, balance1Raw, supplyRaw, priceRaw, outputRaw] = await Promise.all([
    read(client, factory, CURVE_STABLESWAP_NG_FACTORY_ABI, "views_implementation", input.block.number),
    read(client, factory, CURVE_STABLESWAP_NG_FACTORY_ABI, "get_implementation_address", input.block.number, [pool]),
    read(client, factory, CURVE_STABLESWAP_NG_FACTORY_ABI, "get_coins", input.block.number, [pool]),
    read(client, factory, CURVE_STABLESWAP_NG_FACTORY_ABI, "get_decimals", input.block.number, [pool]),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "fee", input.block.number),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "A", input.block.number),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "balances", input.block.number, [0n]),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "balances", input.block.number, [1n]),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "totalSupply", input.block.number),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "get_virtual_price", input.block.number),
    read(client, pool, CURVE_STABLESWAP_NG_POOL_READ_ABI, "get_dy", input.block.number,
      [BigInt(inputIndex), BigInt(outputIndex), input.amountInAtomic]),
  ]);
  const coins = expectTuple(coinsRaw, 2, "Curve coins");
  const decimals = expectTuple(decimalsRaw, 2, "Curve decimals");
  if (!isAddressEqual(expectAddress(viewsRaw, "Curve views"), registry.views.address) ||
    !isAddressEqual(expectAddress(implementationRaw, "Curve implementation"), registry.plainImplementation.address) ||
    !isAddressEqual(expectAddress(coins[0], "Curve coin0"), token0.address) ||
    !isAddressEqual(expectAddress(coins[1], "Curve coin1"), token1.address) ||
    expectBigInt(decimals[0], "Curve decimals0") !== 6n ||
    expectBigInt(decimals[1], "Curve decimals1") !== 6n) {
    throw new Error("Curve factory pool identity mismatch");
  }
  const fee = expectBigInt(feeRaw, "Curve fee");
  const amplification = expectBigInt(amplificationRaw, "Curve amplification");
  const balances = [expectBigInt(balance0Raw, "Curve balance0"),
    expectBigInt(balance1Raw, "Curve balance1")] as const;
  const totalSupply = expectBigInt(supplyRaw, "Curve total supply");
  const virtualPrice = expectBigInt(priceRaw, "Curve virtual price");
  const amountOutAtomic = expectBigInt(outputRaw, "Curve output");
  await assertPinnedBlock(client, input.block);
  if (fee !== BigInt(registry.pair.fee) || amplification <= 0n) {
    throw new Error("Curve pool parameters changed");
  }
  if (balances.some((balance) => balance <= 0n) || totalSupply <= 0n || virtualPrice <= 0n) {
    throw new ProtocolIneligibleError("curve-zero-liquidity", "Curve pool has no usable liquidity");
  }
  if (amountOutAtomic <= 0n) {
    throw new ProtocolIneligibleError("curve-zero-output", "Curve quote returned zero output");
  }
  return {
    adapterId: registry.adapterId, registryHash,
    blockNumber: input.block.number, blockHash: input.block.hash,
    blockTimestamp: input.block.timestamp, pool, tokenIn: tokenIn.address,
    tokenOut: tokenOut.address, inputIndex, outputIndex, amountInAtomic: input.amountInAtomic,
    amountOutAtomic, fee, amplification, balances, totalSupply, virtualPrice,
  };
}
