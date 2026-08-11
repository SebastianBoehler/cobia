import { isAddressEqual } from "viem";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import { buildPostSwapSupplyTransactionsV2 } from "./build-post-swap";
import { buildPostSwapLiquidityTransactionsV2 } from "./build-post-swap-lp";
import type { VerifiedExecutionInputV2 } from "./execution-context";
import type {
  CapturedExecutionStateV2,
  ExecutionResumeCheckpointV2,
} from "./engine-types";
import {
  describeExecutionTransactionV2,
  type ExecutionTransactionDescriptorV2,
} from "./transaction-descriptor";
import type { OwnerTransactionV2 } from "./types";

function sameTransaction(left: OwnerTransactionV2, right: OwnerTransactionV2) {
  return left.label === right.label && left.chainId === right.chainId &&
    isAddressEqual(left.from, right.from) && isAddressEqual(left.to, right.to) &&
    left.value === right.value && left.data.toLowerCase() === right.data.toLowerCase() &&
    left.minimumLiquidity === right.minimumLiquidity;
}

function addressMatch(left: `0x${string}`, right: `0x${string}`) {
  return isAddressEqual(left, right);
}

function stateMatchesDescriptor(
  state: CapturedExecutionStateV2,
  descriptor: ExecutionTransactionDescriptorV2,
): boolean {
  if (state.kind !== descriptor.kind) return false;
  if (state.kind === "allowance" && descriptor.kind === "allowance") {
    return addressMatch(state.token, descriptor.token) &&
      addressMatch(state.spender, descriptor.spender) &&
      state.expectedAtomic === descriptor.expectedAtomic;
  }
  if (state.kind === "swap" && descriptor.kind === "swap") {
    return addressMatch(state.tokenIn, descriptor.tokenIn) &&
      addressMatch(state.tokenOut, descriptor.tokenOut) &&
      state.amountInAtomic === descriptor.amountInAtomic &&
      state.minimumOutputAtomic === descriptor.minimumOutputAtomic;
  }
  if (state.kind === "aave-supply" && descriptor.kind === "aave-supply") {
    return addressMatch(state.asset, descriptor.asset) &&
      addressMatch(state.aToken, descriptor.aToken) &&
      state.suppliedAtomic === descriptor.suppliedAtomic;
  }
  if (state.kind === "uniswap-lp-mint" && descriptor.kind === "uniswap-lp-mint") {
    return addressMatch(state.token0, descriptor.token0) &&
      addressMatch(state.token1, descriptor.token1) &&
      state.feeTier === descriptor.feeTier && state.tickLower === descriptor.tickLower &&
      state.tickUpper === descriptor.tickUpper &&
      state.amount0DesiredAtomic === descriptor.amount0DesiredAtomic &&
      state.amount1DesiredAtomic === descriptor.amount1DesiredAtomic &&
      state.amount0MinAtomic === descriptor.amount0MinAtomic &&
      state.amount1MinAtomic === descriptor.amount1MinAtomic &&
      state.minimumLiquidity === descriptor.minimumLiquidity &&
      state.deadlineSec === descriptor.deadlineSec;
  }
  return false;
}

function allowanceBefore(
  checkpoint: ExecutionResumeCheckpointV2,
): bigint {
  return checkpoint.capturedState.kind === "allowance"
    ? checkpoint.capturedState.beforeAtomic
    : checkpoint.authorizedAmountAtomic;
}

function authorizedTransactions(
  verified: Omit<VerifiedExecutionInputV2, "nowSec">,
  checkpoint: ExecutionResumeCheckpointV2,
) {
  if (checkpoint.phase === "initial") {
    const leg = verified.bundle.routePlan.legs[0];
    const first = leg?.actions[0];
    const expected = first?.kind === "uniswap-v3-balance-swap"
      ? BigInt(first.inputAtomic) : leg ? BigInt(leg.inputAtomic) : undefined;
    if (!leg || checkpoint.authorizedAmountAtomic !== expected) return [];
    return buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: 0,
      currentAllowanceAtomic: allowanceBefore(checkpoint),
    }).transactions;
  }
  const first = verified.bundle.routePlan.legs[0]?.actions[0];
  if (first?.kind === "uniswap-v3-balance-swap") {
    const mint = verified.bundle.routePlan.legs[0]?.actions[1];
    if (mint?.kind !== "uniswap-v3-full-range-mint") return [];
    const minimum = BigInt(first.minimumOutputAtomic);
    const quoted = BigInt(first.quotedOutputAtomic);
    if (checkpoint.authorizedAmountAtomic < minimum ||
      checkpoint.authorizedAmountAtomic > quoted) return [];
    const token0Required = isAddressEqual(first.tokenOut, mint.token0)
      ? checkpoint.authorizedAmountAtomic : BigInt(mint.amount0DesiredAtomic);
    const token1Required = isAddressEqual(first.tokenOut, mint.token1)
      ? checkpoint.authorizedAmountAtomic : BigInt(mint.amount1DesiredAtomic);
    const state = checkpoint.capturedState;
    const token0Allowance = state.kind === "allowance" &&
      isAddressEqual(state.token, mint.token0) ? state.beforeAtomic : token0Required;
    const token1Allowance = state.kind === "allowance" &&
      isAddressEqual(state.token, mint.token1) ? state.beforeAtomic : token1Required;
    return buildPostSwapLiquidityTransactionsV2({
      ...verified,
      nowSec: 0,
      observedOutputBalanceDeltaAtomic: checkpoint.authorizedAmountAtomic,
      currentToken0AllowanceAtomic: token0Allowance,
      currentToken1AllowanceAtomic: token1Allowance,
    }).transactions;
  }
  if (first?.kind !== "uniswap-v3-exact-input") return [];
  const minimum = BigInt(first.minimumOutputAtomic);
  const quoted = BigInt(first.quotedOutputAtomic);
  if (checkpoint.authorizedAmountAtomic < minimum ||
    checkpoint.authorizedAmountAtomic > quoted) return [];
  return buildPostSwapSupplyTransactionsV2({
    ...verified,
    nowSec: 0,
    observedOutputBalanceDeltaAtomic: checkpoint.authorizedAmountAtomic,
    currentAllowanceAtomic: allowanceBefore(checkpoint),
  }).transactions;
}

export function assertAuthorizedResumeCheckpointV2(
  verified: Omit<VerifiedExecutionInputV2, "nowSec">,
  checkpoint: ExecutionResumeCheckpointV2,
): void {
  try {
    if (checkpoint.submitted.label !== checkpoint.transaction.label ||
      checkpoint.authorizedAmountAtomic <= 0n ||
      !stateMatchesDescriptor(
        checkpoint.capturedState,
        describeExecutionTransactionV2(checkpoint.transaction),
      ) ||
      !authorizedTransactions(verified, checkpoint).some((transaction) =>
        sameTransaction(transaction, checkpoint.transaction))) {
      throw new Error("mismatch");
    }
  } catch {
    throw new Error("Resume checkpoint is not an authorized step of this verified route");
  }
}
