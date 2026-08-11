import { isAddressEqual, type Hash } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import { buildPostSwapSupplyTransactionsV2 } from "./build-post-swap";
import {
  assertExecutionBlockHashV2,
  assertExecutionDeploymentsV2,
} from "./execution-deployments";
import { assertExecutionReadChainV2 } from "./execution-authority";
import {
  parseExecutionContextV2,
  registeredExecutionAsset,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import type {
  CapturedExecutionStateV2,
  ConfirmedOwnerTransactionV2,
  ExecutionReadClientV2,
  ExecutionResumeCheckpointV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import { assertAuthorizedResumeCheckpointV2 } from "./resume-authorization";
import { resolveValidatedCheckpointV2 } from "./resolve-submitted";
import { captureTransactionStateV2, readAllowanceV2 } from "./transaction-state";
import type { ReceiptPollWaitV2 } from "./receipt-validation";
import type { OwnerTransactionV2 } from "./types";

export interface GuidedPreparedStepV2 {
  kind: "prepared";
  phase: "initial" | "post-swap";
  transaction: OwnerTransactionV2;
  capturedState: CapturedExecutionStateV2;
  authorizedAmountAtomic: bigint;
  preBlockNumber: bigint;
  preBlockHash: Hash;
  expectedNonce: bigint;
  gasEstimate: bigint;
}

export type GuidedPreparationResultV2 = GuidedPreparedStepV2 | { kind: "complete" };

interface GuidedSessionInputV2 extends Omit<VerifiedExecutionInputV2, "nowSec"> {
  nowSec: number;
  readClient: ExecutionReadClientV2;
}

function latestSwap(confirmed: readonly ConfirmedOwnerTransactionV2[]) {
  return confirmed.findLast((transaction) => transaction.stateCheck.kind === "swap");
}

async function nextTransactions(
  input: GuidedSessionInputV2,
  confirmed: readonly ConfirmedOwnerTransactionV2[],
  blockNumber: bigint,
) {
  const context = parseExecutionContextV2(input);
  const leg = context.routePlan.legs[0];
  if (!leg || confirmed.some(({ label }) => label === "aave-v3-supply")) {
    return { context, phase: "initial" as const, authorizedAmountAtomic: 0n, transactions: [] };
  }
  const first = leg.actions[0];
  const swap = latestSwap(confirmed);
  if (!swap) {
    const spender = first.kind === "aave-v3-supply"
      ? PROTOCOL_REGISTRY.aaveV3.pool.address
      : PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;
    const asset = first.kind === "aave-v3-supply"
      ? registeredExecutionAsset(first.asset)
      : registeredSwapPair(first.tokenIn, first.tokenOut).input;
    const allowance = await readAllowanceV2(
      input.readClient, asset.address, context.owner, spender, blockNumber,
    );
    const batch = buildInitialRouteTransactionsV2({ ...input, currentAllowanceAtomic: allowance });
    return {
      context,
      phase: "initial" as const,
      authorizedAmountAtomic: BigInt(leg.inputAtomic),
      transactions: batch.transactions,
    };
  }
  if (first.kind !== "uniswap-v3-exact-input" || swap.stateCheck.kind !== "swap") {
    throw new Error("Confirmed execution prefix does not match the route plan");
  }
  const pair = registeredSwapPair(first.tokenIn, first.tokenOut);
  const allowance = await readAllowanceV2(
    input.readClient,
    pair.output.address,
    context.owner,
    PROTOCOL_REGISTRY.aaveV3.pool.address,
    blockNumber,
  );
  const batch = buildPostSwapSupplyTransactionsV2({
    ...input,
    observedOutputBalanceDeltaAtomic: swap.stateCheck.outputDeltaAtomic,
    currentAllowanceAtomic: allowance,
  });
  const authorizedAmountAtomic = swap.stateCheck.outputDeltaAtomic < BigInt(first.quotedOutputAtomic)
    ? swap.stateCheck.outputDeltaAtomic : BigInt(first.quotedOutputAtomic);
  return { context, phase: "post-swap" as const, authorizedAmountAtomic,
    transactions: batch.transactions };
}

export async function prepareNextGuidedStepV2(
  input: GuidedSessionInputV2,
  confirmed: readonly ConfirmedOwnerTransactionV2[],
): Promise<GuidedPreparationResultV2> {
  await assertExecutionReadChainV2(input.readClient);
  const preBlockNumber = await input.readClient.getBlockNumber();
  const next = await nextTransactions(input, confirmed, preBlockNumber);
  const transaction = next.transactions[0];
  if (!transaction) return { kind: "complete" };
  if (!isAddressEqual(transaction.from, next.context.owner) || transaction.value !== 0n) {
    throw new Error("Guided transaction does not match execution owner");
  }
  const preBlockHash = await assertExecutionDeploymentsV2(
    input.readClient, transaction, preBlockNumber,
  );
  const capturedState = await captureTransactionStateV2(
    input.readClient, transaction, next.context.owner, preBlockNumber,
  );
  await assertExecutionBlockHashV2(input.readClient, preBlockNumber, preBlockHash);
  const expectedNonce = await input.readClient.getTransactionCount(next.context.owner);
  if (expectedNonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Execution nonce is unsafe");
  }
  const gasEstimate = await input.readClient.estimateGas({
    from: transaction.from,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
    nonce: expectedNonce,
  });
  await assertExecutionBlockHashV2(input.readClient, preBlockNumber, preBlockHash);
  return Object.freeze({
    kind: "prepared",
    phase: next.phase,
    transaction: Object.freeze({ ...transaction }),
    capturedState: Object.freeze({ ...capturedState }),
    authorizedAmountAtomic: next.authorizedAmountAtomic,
    preBlockNumber,
    preBlockHash,
    expectedNonce,
    gasEstimate,
  });
}

export async function resolveGuidedStepV2(input: GuidedSessionInputV2 & {
  prepared: GuidedPreparedStepV2;
  transactionHash: Hash;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}): Promise<SubmittedResumeResultV2> {
  // A transaction submitted while authorized must remain resolvable after the
  // quote deadline. Freshness is enforced before preparation and broadcast.
  const context = parseExecutionContextV2({ ...input, nowSec: 0 });
  const submitted = Object.freeze({
    label: input.prepared.transaction.label,
    hash: input.transactionHash,
    preBlockNumber: input.prepared.preBlockNumber,
    preBlockHash: input.prepared.preBlockHash,
    gasEstimate: input.prepared.gasEstimate,
  });
  const checkpoint = Object.freeze({
    version: 1,
    kind: "submitted-hash",
    chainId: 196,
    owner: context.owner,
    bundleHash: input.verdict.bundleHash,
    phase: input.prepared.phase,
    authorizedAmountAtomic: input.prepared.authorizedAmountAtomic,
    expectedNonce: input.prepared.expectedNonce,
    transaction: input.prepared.transaction,
    submitted,
    capturedState: input.prepared.capturedState,
  } satisfies ExecutionResumeCheckpointV2);
  assertAuthorizedResumeCheckpointV2(input, checkpoint);
  await assertExecutionReadChainV2(input.readClient);
  return resolveValidatedCheckpointV2({
    readClient: input.readClient,
    checkpoint,
    waitForReceiptPoll: input.waitForReceiptPoll,
  });
}
