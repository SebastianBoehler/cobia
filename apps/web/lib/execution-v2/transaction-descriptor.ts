import { decodeFunctionData, isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  ERC20_APPROVE_ABI,
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
  return supplyDescriptor(transaction);
}
