import { isAddressEqual, type Address } from "viem";
import { UNISWAP_FACTORY_ABI, UNISWAP_POOL_ABI, UNISWAP_QUOTER_V2_ABI } from "./abis";
import {
  assertRuntimeCode,
  assertChainId,
  assertPinnedBlock,
  expectAddress,
  expectBigInt,
  expectBoolean,
  expectNumber,
  expectTuple,
  type BlockReference,
  type ProtocolReadClient,
} from "./read-client";
import { PROTOCOL_REGISTRY, registryHash, type RegistryAsset } from "./registry";
import { ProtocolIneligibleError } from "./protocol-error";

export interface UniswapExactInputQuote {
  adapterId: "uniswap-v3@1";
  registryHash: typeof registryHash;
  blockNumber: bigint;
  blockHash: BlockReference["hash"];
  blockTimestamp: bigint;
  tokenIn: Address;
  tokenOut: Address;
  pool: Address;
  fee: 100;
  liquidity: bigint;
  amountInAtomic: bigint;
  amountOutAtomic: bigint;
  sqrtPriceX96After: bigint;
  initializedTicksCrossed: number;
  gasEstimate: bigint;
}

function sameAddress(actual: Address, expected: Address, label: string) {
  if (!isAddressEqual(actual, expected)) throw new Error(`${label} identity mismatch`);
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

export async function quoteUniswapExactInputSingle(
  client: ProtocolReadClient,
  input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  },
): Promise<UniswapExactInputQuote> {
  if (input.amountInAtomic <= 0n) throw new Error("Uniswap input amount must be positive");
  if (input.tokenIn === input.tokenOut) throw new Error("Uniswap pair must use distinct assets");
  const registry = PROTOCOL_REGISTRY;
  const tokenIn = registry.aaveV3.assets[input.tokenIn];
  const tokenOut = registry.aaveV3.assets[input.tokenOut];
  if (!tokenIn || !tokenOut) throw new Error("Uniswap asset is not registered");
  const uniswap = registry.uniswapV3;
  const pair = uniswap.pair;
  const pairAssets = new Set<RegistryAsset>([pair.token0, pair.token1]);
  if (!pairAssets.has(input.tokenIn) || !pairAssets.has(input.tokenOut)) {
    throw new Error("Uniswap pair is not registered");
  }
  const block = input.block;

  await assertChainId(client, PROTOCOL_REGISTRY.chainId);
  await assertPinnedBlock(client, block);
  await Promise.all([
    assertRuntimeCode(client, uniswap.factory, "Uniswap factory", block.number),
    assertRuntimeCode(client, uniswap.quoterV2, "Uniswap quoter", block.number),
    assertRuntimeCode(client, uniswap.swapRouter02, "Uniswap router", block.number),
    assertRuntimeCode(client, pair.pool, "Uniswap pool", block.number),
    assertRuntimeCode(client, tokenIn.underlying, `${input.tokenIn} underlying`, block.number),
    assertRuntimeCode(client, tokenOut.underlying, `${input.tokenOut} underlying`, block.number),
  ]);

  const quoteParameters = {
    tokenIn: tokenIn.underlying.address,
    tokenOut: tokenOut.underlying.address,
    amountIn: input.amountInAtomic,
    fee: pair.fee,
    sqrtPriceLimitX96: 0n,
  } as const;
  const [resolvedPool, poolFactory, poolToken0, poolToken1, poolFee, liquidityRaw,
    slot0Raw, quoteRaw] = await Promise.all([
    read(client, uniswap.factory.address, UNISWAP_FACTORY_ABI, "getPool", block.number,
      [quoteParameters.tokenIn, quoteParameters.tokenOut, pair.fee]),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "factory", block.number),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "token0", block.number),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "token1", block.number),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "fee", block.number),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "liquidity", block.number),
    read(client, pair.pool.address, UNISWAP_POOL_ABI, "slot0", block.number),
    read(client, uniswap.quoterV2.address, UNISWAP_QUOTER_V2_ABI,
      "quoteExactInputSingle", block.number, [quoteParameters]),
  ]);

  sameAddress(expectAddress(resolvedPool, "Uniswap factory pool"), pair.pool.address, "Uniswap factory pool");
  sameAddress(expectAddress(poolFactory, "Uniswap pool factory"), uniswap.factory.address, "Uniswap pool factory");
  const canonicalToken0 = registry.aaveV3.assets[pair.token0].underlying.address;
  const canonicalToken1 = registry.aaveV3.assets[pair.token1].underlying.address;
  sameAddress(expectAddress(poolToken0, "Uniswap token0"), canonicalToken0, "Uniswap token0");
  sameAddress(expectAddress(poolToken1, "Uniswap token1"), canonicalToken1, "Uniswap token1");
  if (expectNumber(poolFee, "Uniswap fee") !== pair.fee) {
    throw new Error("Uniswap fee identity mismatch");
  }
  const liquidity = expectBigInt(liquidityRaw, "Uniswap liquidity");
  const slot0 = expectTuple(slot0Raw, 7, "Uniswap slot0");
  const unlocked = expectBoolean(slot0[6], "Uniswap unlocked flag");

  const quote = expectTuple(quoteRaw, 4, "Uniswap quote");
  const amountOut = expectBigInt(quote[0], "Uniswap amount out");
  const sqrtPriceAfter = expectBigInt(quote[1], "Uniswap price after");
  const initializedTicksCrossed = expectNumber(quote[2], "Uniswap initialized ticks crossed");
  const gasEstimate = expectBigInt(quote[3], "Uniswap gas estimate");
  if (liquidity < 0n || amountOut < 0n || sqrtPriceAfter <= 0n ||
    initializedTicksCrossed < 0 || gasEstimate <= 0n) {
    throw new Error("Uniswap quote returned malformed execution metrics");
  }
  await assertPinnedBlock(client, block);

  if (liquidity === 0n) {
    throw new ProtocolIneligibleError(
      "uniswap-zero-liquidity",
      "Uniswap pool has zero liquidity",
    );
  }
  if (!unlocked) {
    throw new ProtocolIneligibleError("uniswap-pool-locked", "Uniswap pool is locked");
  }
  if (amountOut === 0n) {
    throw new ProtocolIneligibleError(
      "uniswap-zero-output",
      "Uniswap quote returned zero output",
    );
  }

  return {
    adapterId: uniswap.adapterId,
    registryHash,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    tokenIn: tokenIn.underlying.address,
    tokenOut: tokenOut.underlying.address,
    pool: pair.pool.address,
    fee: pair.fee,
    liquidity,
    amountInAtomic: input.amountInAtomic,
    amountOutAtomic: amountOut,
    sqrtPriceX96After: sqrtPriceAfter,
    initializedTicksCrossed,
    gasEstimate,
  };
}
