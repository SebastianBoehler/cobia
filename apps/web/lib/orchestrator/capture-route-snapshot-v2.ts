import {
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  type RouteOpportunityV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { isAddressEqual, type Address } from "viem";
import type { AaveOracleSnapshot } from "../adapters/aave-oracle-reader";
import type { AaveReserveState } from "../adapters/aave-reader";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import {
  PROTOCOL_REGISTRY,
  registryHash,
  type RegistryAsset,
} from "../adapters/registry";
import type { BlockReference } from "../adapters/read-client";
import type { UniswapExactInputQuote } from "../adapters/uniswap-reader";

const BPS_RAY = 10n ** 23n;

export interface RouteSnapshotV2Dependencies {
  getLatestBlock(): Promise<BlockReference>;
  readOraclePrices(input: { block: BlockReference }): Promise<AaveOracleSnapshot>;
  readReserve(input: {
    asset: RegistryAsset;
    amountAtomic: bigint;
    block: BlockReference;
  }): Promise<AaveReserveState>;
  quoteExactInput(input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  }): Promise<UniswapExactInputQuote>;
}

interface RegisteredAsset {
  key: RegistryAsset;
  address: Address;
  decimals: number;
}

const registeredAssets: RegisteredAsset[] = Object.entries(
  PROTOCOL_REGISTRY.aaveV3.assets,
).map(([key, asset]) => ({
  key: key as RegistryAsset,
  address: asset.underlying.address,
  decimals: asset.decimals,
}));

function registered(address: Address): RegisteredAsset {
  const asset = registeredAssets.find((candidate) =>
    isAddressEqual(candidate.address, address),
  );
  if (!asset) throw new Error("Route asset is not registered");
  return asset;
}

function assertContext(
  value: { registryHash: string; blockNumber: bigint; blockHash: string; blockTimestamp: bigint },
  block: BlockReference,
): void {
  if (value.registryHash.toLowerCase() !== registryHash.toLowerCase()) {
    throw new Error("Adapter returned another registry");
  }
  if (
    value.blockNumber !== block.number ||
    value.blockHash.toLowerCase() !== block.hash.toLowerCase() ||
    value.blockTimestamp !== block.timestamp
  ) {
    throw new Error("Adapter returned another snapshot block");
  }
}

function tvlUsdE6(reserve: AaveReserveState, priceUsdE8: bigint): string {
  return (
    reserve.totalATokenAtomic * priceUsdE8 /
    (10n ** BigInt(reserve.decimals) * 100n)
  ).toString();
}

function supplyRateBps(reserve: AaveReserveState): number {
  const rate = reserve.liquidityRateRay / BPS_RAY;
  if (rate > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Aave supply rate exceeds the safe integer range");
  }
  return Number(rate);
}

function deepFreeze(snapshot: RouteSnapshotV2): RouteSnapshotV2 {
  for (const valuation of snapshot.valuations) Object.freeze(valuation);
  for (const opportunity of snapshot.opportunities) Object.freeze(opportunity);
  Object.freeze(snapshot.scannedAdapters);
  Object.freeze(snapshot.valuations);
  Object.freeze(snapshot.opportunities);
  return Object.freeze(snapshot);
}

export async function captureRouteSnapshotV2(
  rawPolicy: StablecoinPolicyV2,
  dependencies: RouteSnapshotV2Dependencies,
): Promise<RouteSnapshotV2> {
  const policy = StablecoinPolicyV2Schema.parse(rawPolicy);
  const inputAsset = registered(policy.asset);
  const allowedAssets = policy.allowedOutputAssets.map(registered);
  const latestBlock = await dependencies.getLatestBlock();
  const block: BlockReference = Object.freeze({
    number: latestBlock.number,
    hash: latestBlock.hash,
    timestamp: latestBlock.timestamp,
  });
  const oracle = await dependencies.readOraclePrices({ block });
  assertContext(oracle, block);
  if (
    oracle.adapterId !== "aave-v3@1" ||
    !isAddressEqual(oracle.oracle, PROTOCOL_REGISTRY.aaveV3.oracle.address) ||
    oracle.baseCurrencyUnit !== 100_000_000n
  ) {
    throw new Error("Aave oracle returned another price authority");
  }
  const priceByAsset = new Map(
    oracle.prices.map((price) => [price.asset.toLowerCase(), price]),
  );
  const valuations = allowedAssets.map(({ address, decimals }) => {
    const price = priceByAsset.get(address.toLowerCase());
    if (!price || price.decimals !== decimals) {
      throw new Error("Aave oracle valuation is missing or has wrong decimals");
    }
    return {
      asset: address.toLowerCase() as Address,
      decimals,
      priceUsdE8: price.priceUsdE8.toString(),
    };
  }).sort((left, right) => left.asset.localeCompare(right.asset));

  const principal = BigInt(policy.principalAtomic);
  const deployed = principal * BigInt(policy.protocolExposureBps) / 10_000n;
  const opportunities: RouteOpportunityV2[] = [];
  let swap: UniswapExactInputQuote | undefined;
  const otherAsset = allowedAssets.find(({ address }) =>
    !isAddressEqual(address, inputAsset.address),
  );
  if (
    deployed > 0n && otherAsset &&
    policy.allowedAdapters.includes("uniswap-v3@1")
  ) {
    try {
      swap = await dependencies.quoteExactInput({
        tokenIn: inputAsset.key,
        tokenOut: otherAsset.key,
        amountInAtomic: deployed,
        block,
      });
      assertContext(swap, block);
      if (
        !isAddressEqual(swap.tokenIn, inputAsset.address) ||
        !isAddressEqual(swap.tokenOut, otherAsset.address) ||
        swap.amountInAtomic !== deployed ||
        !isAddressEqual(swap.pool, PROTOCOL_REGISTRY.uniswapV3.pair.pool.address) ||
        swap.fee !== PROTOCOL_REGISTRY.uniswapV3.pair.fee
      ) {
        throw new Error("Uniswap quote does not match the requested route");
      }
      opportunities.push({
        id: `uniswap-v3:${swap.tokenIn.toLowerCase()}:${swap.tokenOut.toLowerCase()}:${swap.fee}:${swap.amountInAtomic}`,
        kind: "uniswap-v3-exact-input",
        adapterId: swap.adapterId,
        tokenIn: swap.tokenIn,
        tokenOut: swap.tokenOut,
        feeTier: swap.fee,
        quotedInputAtomic: swap.amountInAtomic.toString(),
        quotedOutputAtomic: swap.amountOutAtomic.toString(),
        estimatedGas: swap.gasEstimate.toString(),
      });
    } catch (error) {
      if (!(error instanceof ProtocolIneligibleError)) throw error;
    }
  }

  if (deployed > 0n && policy.allowedAdapters.includes("aave-v3@1")) {
    const amounts = new Map<RegistryAsset, bigint>([[inputAsset.key, deployed]]);
    if (swap && otherAsset) amounts.set(otherAsset.key, swap.amountOutAtomic);
    for (const [assetKey, amountAtomic] of amounts) {
      try {
        const reserve = await dependencies.readReserve({
          asset: assetKey,
          amountAtomic,
          block,
        });
        assertContext(reserve, block);
        const expected = PROTOCOL_REGISTRY.aaveV3.assets[assetKey];
        if (
          !isAddressEqual(reserve.asset, expected.underlying.address) ||
          !isAddressEqual(reserve.aToken, expected.aToken.address) ||
          reserve.decimals !== expected.decimals ||
          reserve.validatedSupplyAtomic !== amountAtomic
        ) {
          throw new Error("Aave reserve does not match the registered asset");
        }
        const price = priceByAsset.get(reserve.asset.toLowerCase());
        if (!price) throw new Error("Aave reserve valuation is missing");
        opportunities.push({
          id: `aave-v3:${reserve.asset.toLowerCase()}`,
          kind: "aave-v3-supply",
          adapterId: reserve.adapterId,
          asset: reserve.asset,
          supplyRateBps: supplyRateBps(reserve),
          tvlUsdE6: tvlUsdE6(reserve, price.priceUsdE8),
          availableLiquidityAtomic: reserve.availableLiquidityAtomic.toString(),
          validatedSupplyAtomic: reserve.validatedSupplyAtomic.toString(),
        });
      } catch (error) {
        if (!(error instanceof ProtocolIneligibleError)) throw error;
      }
    }
  }

  const capturedAt = new Date(Number(block.timestamp) * 1_000).toISOString();
  const snapshot = RouteSnapshotV2Schema.parse({
    version: 2,
    requestId: policy.requestId,
    chainId: PROTOCOL_REGISTRY.chainId,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    capturedAt,
    adapterRegistryHash: registryHash,
    scannedAdapters: policy.allowedAdapters,
    valuations,
    opportunities: opportunities.sort((left, right) => left.id.localeCompare(right.id)),
  });
  return deepFreeze(snapshot);
}
