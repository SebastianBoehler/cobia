import type { Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  createRouteExecutionMachineV2,
} from "./execute-batch";
import type { MachineBatchResultV2 } from "./execution-machine-types";
import {
  parseExecutionContextV2,
  registeredCurveSwap,
  registeredExecutionAsset,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import type {
  ConfirmedOwnerTransactionV2,
  ExecutionReadClientV2,
  ExecutionResumeCheckpointV2,
  ExecutionWalletV2,
  RouteExecutionResultV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import { executionFailureV2 } from "./execution-errors";
import { assertExecutionAuthorityV2 } from "./execution-authority";
import type { ReceiptPollWaitV2 } from "./receipt-validation";
import { readAllowanceV2 } from "./transaction-state";
import { EXECUTION_CHAIN_ID } from "./types";

export interface ExecuteRoutePlanInputV2
  extends Omit<VerifiedExecutionInputV2, "nowSec"> {
  nowSec: () => number;
  wallet: ExecutionWalletV2;
  readClient: ExecutionReadClientV2;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}

async function assertExecutionAuthority(
  input: ExecuteRoutePlanInputV2,
  owner: Address,
): Promise<void> {
  await assertExecutionAuthorityV2(input.wallet, input.readClient, owner);
}

function interruptedResult(
  outcome: Exclude<MachineBatchResultV2, { kind: "complete" }>,
  prefix: ConfirmedOwnerTransactionV2[],
  owner: Address,
): RouteExecutionResultV2 {
  const transactions = [...prefix, ...outcome.confirmed];
  if (outcome.kind === "pending") {
    return {
      status: "pending",
      chainId: EXECUTION_CHAIN_ID,
      owner,
      transactions,
      submitted: outcome.submitted,
      resume: outcome.resume,
    };
  }
  return {
    status: transactions.length > 0 ? "partial" : "failed",
    chainId: EXECUTION_CHAIN_ID,
    owner,
    transactions,
    submitted: outcome.submitted,
    resume: outcome.resume,
    failure: outcome.failure,
  };
}

function createMachine(input: ExecuteRoutePlanInputV2, owner: Address) {
  return createRouteExecutionMachineV2({
    ...input,
    owner,
  });
}

export async function executeRoutePlanV2(
  input: ExecuteRoutePlanInputV2,
): Promise<RouteExecutionResultV2> {
  const verified = { policy: input.policy, bundle: input.bundle, verdict: input.verdict };
  const context = parseExecutionContextV2({ ...verified, nowSec: input.nowSec() });
  await assertExecutionAuthority(input, context.owner);
  if (!context.routePlan.legs[0]) {
    return {
      status: "no-action",
      chainId: EXECUTION_CHAIN_ID,
      owner: context.owner,
      transactions: [],
    };
  }
  const machine = createMachine(input, context.owner);
  const first = context.routePlan.legs[0].actions[0];
  const spender = first.kind === "aave-v3-supply"
    ? PROTOCOL_REGISTRY.aaveV3.pool.address
    : first.kind === "curve-stableswap-ng-exact-input"
      ? PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address
    : PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;
  const inputAsset = first.kind === "aave-v3-supply"
    ? registeredExecutionAsset(first.asset)
    : first.kind === "curve-stableswap-ng-exact-input"
      ? registeredCurveSwap(
        first.tokenIn,
        first.tokenOut,
        first.pool,
        first.inputIndex,
        first.outputIndex,
      ).input
      : registeredSwapPair(first.tokenIn, first.tokenOut).input;
  const allowanceBlock = await input.readClient.getBlockNumber();
  const allowance = await readAllowanceV2(
    input.readClient, inputAsset.address, context.owner, spender, allowanceBlock,
  );
  const initial = await machine.executeInitial(allowance);
  if (initial.kind !== "complete") return interruptedResult(initial, [], context.owner);
  if (first.kind === "aave-v3-supply") {
    return {
      status: "success",
      chainId: EXECUTION_CHAIN_ID,
      owner: context.owner,
      transactions: initial.confirmed,
    };
  }
  const swap = initial.confirmed.at(-1);
  try {
    if (swap?.stateCheck.kind !== "swap") throw new Error("Swap evidence was not captured");
    const second = context.routePlan.legs[0]!.actions[1];
    if (!second) {
      return {
        status: "success",
        chainId: EXECUTION_CHAIN_ID,
        owner: context.owner,
        transactions: initial.confirmed,
      };
    }
    const outputAsset = first.kind === "curve-stableswap-ng-exact-input"
      ? registeredCurveSwap(
        first.tokenIn,
        first.tokenOut,
        first.pool,
        first.inputIndex,
        first.outputIndex,
      ).output
      : registeredSwapPair(first.tokenIn, first.tokenOut).output;
    if (first.kind === "uniswap-v3-balance-swap" &&
      second?.kind !== "uniswap-v3-full-range-mint") {
      throw new Error("LP route is missing its mint action");
    }
    const outputAllowance = first.kind === "uniswap-v3-balance-swap" &&
      second?.kind === "uniswap-v3-full-range-mint"
      ? await Promise.all([
        readAllowanceV2(
          input.readClient,
          registeredExecutionAsset(second.token0).address,
          context.owner,
          PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address,
          swap.blockNumber,
        ),
        readAllowanceV2(
          input.readClient,
          registeredExecutionAsset(second.token1).address,
          context.owner,
          PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address,
          swap.blockNumber,
        ),
      ]).then(([token0Atomic, token1Atomic]) => ({ token0Atomic, token1Atomic }))
      : await readAllowanceV2(
        input.readClient,
        outputAsset.address,
        context.owner,
        second.kind === "uniswap-v3-exact-input"
          ? PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address
          : second.kind === "curve-stableswap-ng-exact-input"
            ? PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address
            : PROTOCOL_REGISTRY.aaveV3.pool.address,
        swap.blockNumber,
      );
    const postSwap = await machine.executePostSwap(
      swap,
      outputAllowance,
    );
    if (postSwap.kind !== "complete") {
      return interruptedResult(postSwap, initial.confirmed, context.owner);
    }
    return {
      status: "success",
      chainId: EXECUTION_CHAIN_ID,
      owner: context.owner,
      transactions: [...initial.confirmed, ...postSwap.confirmed],
    };
  } catch (error) {
    return {
      status: "partial",
      chainId: EXECUTION_CHAIN_ID,
      owner: context.owner,
      transactions: initial.confirmed,
      failure: executionFailureV2(error, "step-preflight"),
    };
  }
}

export async function resumeSubmittedRouteTransactionV2(
  input: ExecuteRoutePlanInputV2 & { checkpoint: ExecutionResumeCheckpointV2 },
): Promise<SubmittedResumeResultV2> {
  const context = parseExecutionContextV2({
    policy: input.policy,
    bundle: input.bundle,
    verdict: input.verdict,
    nowSec: 0,
  });
  return createMachine(input, context.owner).resumeSubmitted(input.checkpoint);
}
