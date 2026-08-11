import { isAddressEqual } from "viem";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import { buildPostSwapSupplyTransactionsV2 } from "./build-post-swap";
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
    left.value === right.value && left.data.toLowerCase() === right.data.toLowerCase();
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
    if (!leg || checkpoint.authorizedAmountAtomic !== BigInt(leg.inputAtomic)) return [];
    return buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: 0,
      currentAllowanceAtomic: allowanceBefore(checkpoint),
    }).transactions;
  }
  const first = verified.bundle.routePlan.legs[0]?.actions[0];
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
