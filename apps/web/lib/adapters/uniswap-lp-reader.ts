import { isAddressEqual, type Address } from "viem";
import {
  ERC20_BALANCE_ABI,
  UNISWAP_FACTORY_ABI,
  UNISWAP_POOL_ABI,
  UNISWAP_POSITION_MANAGER_ABI,
} from "./abis";
import {
  assertChainId,
  assertPinnedBlock,
  assertRuntimeCode,
  expectAddress,
  expectBigInt,
  expectBoolean,
  expectNumber,
  expectTuple,
  type BlockReference,
  type ProtocolReadClient,
} from "./read-client";
import { PROTOCOL_REGISTRY, registryHash } from "./registry";
import { ProtocolIneligibleError } from "./protocol-error";

const UINT256_MODULUS = 2n ** 256n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

export interface UniswapFullRangeState {
  adapterId: "uniswap-v3@1";
  registryHash: typeof registryHash;
  blockNumber: bigint;
  blockHash: BlockReference["hash"];
  blockTimestamp: bigint;
  pool: Address;
  positionManager: Address;
  token0: Address;
  token1: Address;
  fee: 100;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  reserve0Atomic: bigint;
  reserve1Atomic: bigint;
  feeGrowth0DeltaX128: bigint;
  feeGrowth1DeltaX128: bigint;
  lookbackSeconds: bigint;
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

function sameAddress(actual: unknown, expected: Address, label: string): void {
  if (!isAddressEqual(expectAddress(actual, label), expected)) {
    throw new Error(`${label} identity mismatch`);
  }
}

function feeGrowthDelta(current: bigint, previous: bigint): bigint {
  return current >= previous ? current - previous : UINT256_MODULUS - previous + current;
}

export async function readUniswapFullRangeState(
  client: ProtocolReadClient,
  input: { block: BlockReference; lookbackBlock: BlockReference },
): Promise<UniswapFullRangeState> {
  if (input.lookbackBlock.number >= input.block.number ||
    input.lookbackBlock.timestamp >= input.block.timestamp) {
    throw new Error("Uniswap LP lookback must precede the snapshot block");
  }
  const registry = PROTOCOL_REGISTRY.uniswapV3;
  const pool = registry.pair.pool;
  const manager = registry.nonfungiblePositionManager;
  const token0 = PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token0].underlying;
  const token1 = PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token1].underlying;

  await assertChainId(client, PROTOCOL_REGISTRY.chainId);
  await Promise.all([
    assertPinnedBlock(client, input.block),
    assertPinnedBlock(client, input.lookbackBlock),
  ]);
  await Promise.all([
    assertRuntimeCode(client, registry.factory, "Uniswap factory", input.block.number),
    assertRuntimeCode(client, pool, "Uniswap pool", input.block.number),
    assertRuntimeCode(client, pool, "Historical Uniswap pool", input.lookbackBlock.number),
    assertRuntimeCode(client, manager, "Uniswap position manager", input.block.number),
    assertRuntimeCode(client, token0, `${registry.pair.token0} underlying`, input.block.number),
    assertRuntimeCode(client, token1, `${registry.pair.token1} underlying`, input.block.number),
  ]);
  const [resolvedPool, poolFactory, poolToken0, poolToken1, poolFee, spacingRaw,
    liquidityRaw, reserve0Raw, reserve1Raw, slot0Raw,
    current0Raw, current1Raw, previous0Raw, previous1Raw,
    managerFactory] = await Promise.all([
    read(client, registry.factory.address, UNISWAP_FACTORY_ABI, "getPool", input.block.number,
      [token0.address, token1.address, registry.pair.fee]),
    read(client, pool.address, UNISWAP_POOL_ABI, "factory", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "token0", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "token1", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "fee", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "tickSpacing", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "liquidity", input.block.number),
    read(client, token0.address, ERC20_BALANCE_ABI, "balanceOf", input.block.number,
      [pool.address]),
    read(client, token1.address, ERC20_BALANCE_ABI, "balanceOf", input.block.number,
      [pool.address]),
    read(client, pool.address, UNISWAP_POOL_ABI, "slot0", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "feeGrowthGlobal0X128", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "feeGrowthGlobal1X128", input.block.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "feeGrowthGlobal0X128", input.lookbackBlock.number),
    read(client, pool.address, UNISWAP_POOL_ABI, "feeGrowthGlobal1X128", input.lookbackBlock.number),
    read(client, manager.address, UNISWAP_POSITION_MANAGER_ABI, "factory", input.block.number),
  ]);
  sameAddress(resolvedPool, pool.address, "Uniswap factory pool");
  sameAddress(poolFactory, registry.factory.address, "Uniswap pool factory");
  sameAddress(poolToken0, token0.address, "Uniswap token0");
  sameAddress(poolToken1, token1.address, "Uniswap token1");
  sameAddress(managerFactory, registry.factory.address, "Uniswap position manager factory");
  if (expectNumber(poolFee, "Uniswap fee") !== registry.pair.fee) {
    throw new Error("Uniswap fee identity mismatch");
  }
  const tickSpacing = expectNumber(spacingRaw, "Uniswap tick spacing");
  if (tickSpacing <= 0) throw new Error("Uniswap tick spacing must be positive");
  const liquidity = expectBigInt(liquidityRaw, "Uniswap liquidity");
  const reserve0Atomic = expectBigInt(reserve0Raw, "Uniswap token0 reserve");
  const reserve1Atomic = expectBigInt(reserve1Raw, "Uniswap token1 reserve");
  const slot0 = expectTuple(slot0Raw, 7, "Uniswap slot0");
  const sqrtPriceX96 = expectBigInt(slot0[0], "Uniswap sqrt price");
  const tick = expectNumber(slot0[1], "Uniswap tick");
  const unlocked = expectBoolean(slot0[6], "Uniswap unlocked flag");
  const current0 = expectBigInt(current0Raw, "Uniswap fee growth 0");
  const current1 = expectBigInt(current1Raw, "Uniswap fee growth 1");
  const previous0 = expectBigInt(previous0Raw, "Historical Uniswap fee growth 0");
  const previous1 = expectBigInt(previous1Raw, "Historical Uniswap fee growth 1");
  await Promise.all([
    assertPinnedBlock(client, input.block),
    assertPinnedBlock(client, input.lookbackBlock),
  ]);
  if (liquidity === 0n) {
    throw new ProtocolIneligibleError("uniswap-zero-liquidity", "Uniswap pool has zero liquidity");
  }
  if (!unlocked) {
    throw new ProtocolIneligibleError("uniswap-pool-locked", "Uniswap pool is locked");
  }
  return {
    adapterId: registry.adapterId,
    registryHash,
    blockNumber: input.block.number,
    blockHash: input.block.hash,
    blockTimestamp: input.block.timestamp,
    pool: pool.address,
    positionManager: manager.address,
    token0: token0.address,
    token1: token1.address,
    fee: registry.pair.fee,
    tickSpacing,
    tickLower: Math.ceil(MIN_TICK / tickSpacing) * tickSpacing,
    tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
    sqrtPriceX96,
    tick,
    liquidity,
    reserve0Atomic,
    reserve1Atomic,
    feeGrowth0DeltaX128: feeGrowthDelta(current0, previous0),
    feeGrowth1DeltaX128: feeGrowthDelta(current1, previous1),
    lookbackSeconds: input.block.timestamp - input.lookbackBlock.timestamp,
  };
}
