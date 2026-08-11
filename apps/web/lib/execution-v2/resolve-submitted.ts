import { ExecutionStepErrorV2, executionFailureV2 } from "./execution-errors";
import { assertExecutionDeploymentsV2 } from "./execution-deployments";
import type {
  ConfirmedOwnerTransactionV2,
  ExecutionReadClientV2,
  ExecutionResumeCheckpointV2,
  ExecutionStateCheckV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import { validateProtocolEventsV2 } from "./receipt-events";
import {
  assertReceiptStillCanonicalV2,
  resolveCanonicalReceiptV2,
  type ReceiptPollWaitV2,
} from "./receipt-validation";
import { validateTransactionStateV2 } from "./transaction-state";

export async function resolveValidatedCheckpointV2(input: {
  readClient: ExecutionReadClientV2;
  checkpoint: ExecutionResumeCheckpointV2;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}): Promise<SubmittedResumeResultV2> {
  try {
    const receipt = await resolveCanonicalReceiptV2(input);
    if (!receipt) return { status: "pending", submitted: input.checkpoint.submitted };
    if (receipt.status !== "success") {
      return {
        status: "failed",
        submitted: input.checkpoint.submitted,
        failure: {
          code: "transaction-reverted",
          message: `Transaction ${input.checkpoint.transaction.label} reverted`,
        },
      };
    }
    const deploymentHash = await assertExecutionDeploymentsV2(
      input.readClient,
      input.checkpoint.transaction,
      receipt.blockNumber,
    );
    if (deploymentHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
      throw new ExecutionStepErrorV2(
        "receipt-reorged",
        "Receipt block changed during deployment validation",
      );
    }
    await assertReceiptStillCanonicalV2({
      ...input,
      expectedReceipt: receipt,
    });
    const protocolEvidence = validateProtocolEventsV2(input.checkpoint.transaction, receipt);
    let stateCheck: ExecutionStateCheckV2;
    try {
      stateCheck = await validateTransactionStateV2(
        input.readClient,
        input.checkpoint.owner,
        receipt.blockNumber,
        input.checkpoint.capturedState,
        protocolEvidence,
      );
      await assertReceiptStillCanonicalV2({
        ...input,
        expectedReceipt: receipt,
      });
    } catch (error) {
      return {
        status: "failed",
        submitted: input.checkpoint.submitted,
        failure: executionFailureV2(error, "state-postcondition"),
      };
    }
    const confirmed = Object.freeze({
      ...input.checkpoint.submitted,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      transactionIndex: receipt.transactionIndex,
      status: "success" as const,
      protocolEvidence: Object.freeze({ ...protocolEvidence }),
      stateCheck: Object.freeze({ ...stateCheck }),
    }) satisfies ConfirmedOwnerTransactionV2;
    return { status: "confirmed", transaction: confirmed };
  } catch (error) {
    return {
      status: "failed",
      submitted: input.checkpoint.submitted,
      failure: executionFailureV2(error, "receipt-attribution"),
    };
  }
}
