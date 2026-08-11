import { decodeFunctionData, isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  ERC20_APPROVE_ABI,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  SWAP_ROUTER02_ABI,
} from "./abis";
import {
  registeredExecutionAsset,
  registeredSwapPair,
} from "./execution-context";
import type { OwnerTransactionV2 } from "./types";

export type ExecutionTransactionDescriptorV2 =
  | {
    kind: "allowance";
    token: Address;
    spender: Address;
    expectedAtomic: bigint;
  }
  | {
    kind: "swap";
    tokenIn: Address;
    tokenOut: Address;
    pool: Address;
    amountInAtomic: bigint;
    minimumOutputAtomic: bigint;
    deadlineSec: bigint;
  }
  | {
    kind: "aave-supply";
    asset: Address;
    aToken: Address;
    suppliedAtomic: bigint;
  }
  | {
    kind: "uniswap-lp-mint";
    token0: Address;
    token1: Address;
    feeTier: number;
    tickLower: number;
    tickUpper: number;
    amount0DesiredAtomic: bigint;
    amount1DesiredAtomic: bigint;
    amount0MinAtomic: bigint;
    amount1MinAtomic: bigint;
    minimumLiquidity: bigint;
    deadlineSec: bigint;
  };

function isApproval(transaction: OwnerTransactionV2): boolean {
  return transaction.label.startsWith("reset-") ||
    transaction.label.startsWith("approve-");
}

function approvalDescriptor(transaction: OwnerTransactionV2) {
  const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: transaction.data });
  const [spender, expectedAtomic] = decoded.args;
  const expectedSpender = transaction.label.includes("aave")
    ? PROTOCOL_REGISTRY.aaveV3.pool.address
    : transaction.label.includes("position-manager")
      ? PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address
      : PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;
  if (!isAddressEqual(spender, expectedSpender)) {
    throw new Error("Approval spender does not match the registered deployment");
  }
  registeredExecutionAsset(transaction.to);
  return {
    kind: "allowance" as const,
    token: transaction.to,
    spender,
    expectedAtomic,
  };
}

function lpMintDescriptor(transaction: OwnerTransactionV2) {
  const deployment = PROTOCOL_REGISTRY.uniswapV3;
  if (!isAddressEqual(transaction.to, deployment.nonfungiblePositionManager.address)) {
    throw new Error("LP mint target does not match the registered position manager");
  }
  const decoded = decodeFunctionData({
    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
    data: transaction.data,
  });
  if (decoded.functionName !== "mint") throw new Error("LP transaction must call mint");
  const params = decoded.args[0];
  const token0 = registeredExecutionAsset(params.token0);
  const token1 = registeredExecutionAsset(params.token1);
  const pairToken0 = PROTOCOL_REGISTRY.aaveV3.assets[deployment.pair.token0].underlying.address;
  const pairToken1 = PROTOCOL_REGISTRY.aaveV3.assets[deployment.pair.token1].underlying.address;
  if (!isAddressEqual(token0.address, pairToken0) ||
    !isAddressEqual(token1.address, pairToken1) || params.fee !== deployment.pair.fee ||
    params.tickLower !== -887272 || params.tickUpper !== 887272 ||
    !isAddressEqual(params.recipient, transaction.from) ||
    params.amount0Desired <= 0n || params.amount1Desired <= 0n ||
    params.amount0Min <= 0n || params.amount1Min <= 0n ||
    params.amount0Min > params.amount0Desired || params.amount1Min > params.amount1Desired ||
    params.deadline <= 0n || !transaction.minimumLiquidity || transaction.minimumLiquidity <= 0n) {
    throw new Error("LP mint parameters do not match the registered bounded route");
  }
  return {
    kind: "uniswap-lp-mint" as const,
    token0: token0.address,
    token1: token1.address,
    feeTier: params.fee,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    amount0DesiredAtomic: params.amount0Desired,
    amount1DesiredAtomic: params.amount1Desired,
    amount0MinAtomic: params.amount0Min,
    amount1MinAtomic: params.amount1Min,
    minimumLiquidity: transaction.minimumLiquidity,
    deadlineSec: params.deadline,
  };
}

function swapDescriptor(transaction: OwnerTransactionV2) {
  if (!isAddressEqual(transaction.to, PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address)) {
    throw new Error("Swap target does not match the registered router");
  }
  const outer = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: transaction.data });
  if (outer.functionName !== "multicall" || outer.args[1].length !== 1) {
    throw new Error("Swap transaction must contain exactly one router call");
  }
  const inner = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: outer.args[1][0] });
  if (inner.functionName !== "exactInputSingle") {
    throw new Error("Swap transaction must contain exactInputSingle");
  }
  const params = inner.args[0];
  const pair = registeredSwapPair(params.tokenIn, params.tokenOut);
  if (params.fee !== pair.fee || params.sqrtPriceLimitX96 !== 0n) {
    throw new Error("Swap parameters do not match the registered pair");
  }
  if (!isAddressEqual(params.recipient, transaction.from)) {
    throw new Error("Swap recipient must be the execution owner");
  }
  return {
    kind: "swap" as const,
    tokenIn: pair.input.address,
    tokenOut: pair.output.address,
    pool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address,
    amountInAtomic: params.amountIn,
    minimumOutputAtomic: params.amountOutMinimum,
    deadlineSec: outer.args[0],
  };
}

function supplyDescriptor(transaction: OwnerTransactionV2) {
  if (!isAddressEqual(transaction.to, PROTOCOL_REGISTRY.aaveV3.pool.address)) {
    throw new Error("Aave supply target does not match the registered pool");
  }
  const decoded = decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: transaction.data });
  const [assetAddress, suppliedAtomic, onBehalfOf, referralCode] = decoded.args;
  const asset = registeredExecutionAsset(assetAddress);
  if (!isAddressEqual(onBehalfOf, transaction.from) || referralCode !== 0) {
    throw new Error("Aave supply beneficiary or referral code is invalid");
  }
  return {
    kind: "aave-supply" as const,
    asset: asset.address,
    aToken: asset.aToken,
    suppliedAtomic,
  };
}

export function describeExecutionTransactionV2(
  transaction: OwnerTransactionV2,
): ExecutionTransactionDescriptorV2 {
  if (isApproval(transaction)) return approvalDescriptor(transaction);
  if (transaction.label === "uniswap-v3-exact-input") {
    return swapDescriptor(transaction);
  }
  if (transaction.label === "uniswap-v3-full-range-mint") {
    return lpMintDescriptor(transaction);
  }
  return supplyDescriptor(transaction);
}
