import { isAddressEqual } from "viem";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import { buildPostSwapSupplyTransactionsV2 } from "./build-post-swap";
import { buildPostSwapLiquidityTransactionsV2 } from "./build-post-swap-lp";
import {
  assertExecutionBlockHashV2,
  assertExecutionDeploymentsV2,
} from "./execution-deployments";
import { executionFailureV2 } from "./execution-errors";
import {
  assertExecutionAuthorityV2,
  assertExecutionReadChainV2,
} from "./execution-authority";
import { parseExecutionContextV2 } from "./execution-context";
import type {
  ConfirmedOwnerTransactionV2,
  ExecutionResumeCheckpointV2,
  SubmittedOwnerTransactionV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import type {
  MachineBatchResultV2,
  RouteExecutionMachineInputV2,
  RouteExecutionMachineV2,
} from "./execution-machine-types";
import { captureTransactionStateV2 } from "./transaction-state";
import { assertAuthorizedResumeCheckpointV2 } from "./resume-authorization";
import { resolveValidatedCheckpointV2 } from "./resolve-submitted";
import { SwapCapabilityStoreV2 } from "./swap-capability";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";
import { EXECUTION_CHAIN_ID, type OwnerTransactionV2 } from "./types";
import {
  parseWalletHashV2,
  parseWalletQuantityV2,
  walletTransactionV2,
} from "./wallet-rpc";

// Process-local provenance only. Persisted resume requires a separately
// authenticated codec and full route re-verification after restart.
const issuedExecutionCheckpoints = new WeakSet<ExecutionResumeCheckpointV2>();
const swapCapabilities = new SwapCapabilityStoreV2();

function stepFailure(error: unknown, confirmed: ConfirmedOwnerTransactionV2[]) {
  if (confirmed.length === 0) throw error;
  return {
    kind: "failed" as const,
    confirmed,
    failure: executionFailureV2(error, "step-preflight"),
  };
}

export function createRouteExecutionMachineV2(
  input: RouteExecutionMachineInputV2,
): RouteExecutionMachineV2 {
  const verified = { policy: input.policy, bundle: input.bundle, verdict: input.verdict };
  const context = parseExecutionContextV2({ ...verified, nowSec: 0 });
  if (!isAddressEqual(context.owner, input.owner)) throw new Error("Machine owner mismatch");
  const assertFresh = () => parseExecutionContextV2({ ...verified, nowSec: input.nowSec() });

  async function resolve(
    checkpoint: ExecutionResumeCheckpointV2,
  ): Promise<SubmittedResumeResultV2> {
    if (!issuedExecutionCheckpoints.has(checkpoint)) {
      throw new Error("Resume checkpoint is not an authorized step of this verified route");
    }
    if (checkpoint.bundleHash.toLowerCase() !== input.verdict.bundleHash.toLowerCase() ||
      !isAddressEqual(checkpoint.owner, input.owner) ||
      checkpoint.chainId !== EXECUTION_CHAIN_ID) {
      throw new Error("Resume checkpoint does not belong to this verified route");
    }
    assertAuthorizedResumeCheckpointV2(verified, checkpoint);
    try {
      await assertExecutionReadChainV2(input.readClient);
    } catch (error) {
      return {
        status: "failed",
        submitted: checkpoint.submitted,
        failure: executionFailureV2(error, "receipt-attribution"),
      };
    }
    const result = await resolveValidatedCheckpointV2({
      readClient: input.readClient,
      checkpoint,
      waitForReceiptPoll: input.waitForReceiptPoll,
    });
    if (result.status === "confirmed" && result.transaction.stateCheck.kind === "swap") {
      swapCapabilities.register(result.transaction, checkpoint);
    }
    swapCapabilities.settleResume(checkpoint, result);
    return result;
  }

  async function executeBatch(
    transactions: readonly OwnerTransactionV2[],
    phase: ExecutionResumeCheckpointV2["phase"],
    explicitAuthorizedAmountAtomic?: bigint,
  ): Promise<MachineBatchResultV2> {
    const confirmed: ConfirmedOwnerTransactionV2[] = [];
    const finalDescriptor = transactions.at(-1)
      ? describeExecutionTransactionV2(transactions.at(-1)!)
      : undefined;
    const authorizedAmountAtomic = explicitAuthorizedAmountAtomic ?? (finalDescriptor?.kind === "swap"
      ? finalDescriptor.amountInAtomic
      : finalDescriptor?.kind === "aave-supply"
        ? finalDescriptor.suppliedAtomic
        : undefined);
    if (transactions.length > 0 && authorizedAmountAtomic === undefined) {
      throw new Error("Execution batch has no authorized protocol action");
    }
    for (const transaction of transactions) {
      let checkpoint: ExecutionResumeCheckpointV2;
      try {
        if (transaction.chainId !== EXECUTION_CHAIN_ID || transaction.value !== 0n ||
          !isAddressEqual(transaction.from, input.owner)) {
          throw new Error("Owner transaction does not match the execution context");
        }
        await assertExecutionAuthorityV2(input.wallet, input.readClient, input.owner);
        const preBlockNumber = await input.readClient.getBlockNumber();
        const preBlockHash = await assertExecutionDeploymentsV2(
          input.readClient,
          transaction,
          preBlockNumber,
        );
        const capturedState = await captureTransactionStateV2(
          input.readClient,
          transaction,
          input.owner,
          preBlockNumber,
        );
        await assertExecutionBlockHashV2(
          input.readClient,
          preBlockNumber,
          preBlockHash,
        );
        const rpcTransaction = walletTransactionV2(transaction);
        const gasEstimate = parseWalletQuantityV2(await input.wallet.request({
          method: "eth_estimateGas",
          params: [rpcTransaction],
        }), "Gas estimation");
        await assertExecutionBlockHashV2(
          input.readClient,
          preBlockNumber,
          preBlockHash,
        );
        await assertExecutionAuthorityV2(input.wallet, input.readClient, input.owner);
        // Request-time only: an injected-wallet prompt can outlive validUntil.
        // Uniswap enforces swap expiry on-chain; Curve, approvals, and Aave do not.
        assertFresh();
        const hash = parseWalletHashV2(await input.wallet.request({
          method: "eth_sendTransaction",
          params: [rpcTransaction],
        }));
        const submitted = Object.freeze({
          label: transaction.label,
          hash,
          preBlockNumber,
          preBlockHash,
          gasEstimate,
        } satisfies SubmittedOwnerTransactionV2);
        checkpoint = Object.freeze({
          version: 1,
          kind: "submitted-hash",
          chainId: EXECUTION_CHAIN_ID,
          owner: input.owner,
          bundleHash: input.verdict.bundleHash,
          phase,
          authorizedAmountAtomic: authorizedAmountAtomic!,
          transaction: Object.freeze({ ...transaction }),
          submitted,
          capturedState: Object.freeze({ ...capturedState }),
        });
        issuedExecutionCheckpoints.add(checkpoint);
      } catch (error) {
        return stepFailure(error, confirmed);
      }

      const resolved = await resolve(checkpoint);
      if (resolved.status === "pending") {
        return {
          kind: "pending",
          confirmed,
          submitted: resolved.submitted,
          resume: checkpoint,
        };
      }
      if (resolved.status === "failed") {
        return {
          kind: "failed",
          confirmed,
          submitted: resolved.submitted,
          resume: checkpoint,
          failure: resolved.failure,
        };
      }
      confirmed.push(resolved.transaction);
    }
    return { kind: "complete", confirmed };
  }

  return Object.freeze({
    executeInitial(currentAllowanceAtomic: bigint) {
      const batch = buildInitialRouteTransactionsV2({
        ...verified,
        nowSec: input.nowSec(),
        currentAllowanceAtomic,
      });
      return executeBatch(batch.transactions, "initial");
    },
    executePostSwap(
      confirmedSwap: ConfirmedOwnerTransactionV2,
      currentAllowances: import("./execution-machine-types").PostSwapAllowancesV2,
    ) {
      const reservation = swapCapabilities.begin(confirmedSwap, (source) => {
        if (source.bundleHash.toLowerCase() !== input.verdict.bundleHash.toLowerCase() ||
          !isAddressEqual(source.owner, input.owner) || source.phase !== "initial") {
          throw new Error("Confirmed swap capability does not belong to this verified route");
        }
        assertAuthorizedResumeCheckpointV2(verified, source);
      });
      try {
        const first = context.routePlan.legs[0]?.actions[0];
        const batch = first?.kind === "uniswap-v3-balance-swap"
          ? (() => {
            if (typeof currentAllowances === "bigint") {
              throw new Error("LP continuation requires both position-manager allowances");
            }
            return buildPostSwapLiquidityTransactionsV2({
              ...verified,
              nowSec: input.nowSec(),
              observedOutputBalanceDeltaAtomic: reservation.outputDeltaAtomic,
              currentToken0AllowanceAtomic: currentAllowances.token0Atomic,
              currentToken1AllowanceAtomic: currentAllowances.token1Atomic,
            });
          })()
          : (() => {
            if (typeof currentAllowances !== "bigint") {
              throw new Error("Aave continuation requires one pool allowance");
            }
            return buildPostSwapSupplyTransactionsV2({
              ...verified,
              nowSec: input.nowSec(),
              observedOutputBalanceDeltaAtomic: reservation.outputDeltaAtomic,
              currentAllowanceAtomic: currentAllowances,
            });
          })();
        return executeBatch(
          batch.transactions,
          "post-swap",
          reservation.outputDeltaAtomic,
        ).then(
          (result) => {
            swapCapabilities.settleBatch(reservation, result);
            return result;
          },
          (error: unknown) => {
            swapCapabilities.release(reservation);
            throw error;
          },
        );
      } catch (error) {
        swapCapabilities.release(reservation);
        throw error;
      }
    },
    resumeSubmitted: resolve,
  });
}
