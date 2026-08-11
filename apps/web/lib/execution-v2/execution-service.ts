import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hash, type Hex } from "viem";
import { issueAttemptToken, verifyAttemptToken } from "./attempt-token";
import {
  loadExecutionArtifactV2,
  verifyFreshExecutionArtifactV2,
  verifyStoredExecutionArtifactV2,
} from "./execution-artifact";
import type {
  ExecutionArtifactV2,
  ExecutionServiceDependencies,
  StepRow,
} from "./execution-service-types";
import { executionSessionView } from "./execution-session-view";
import { assertGuidedFundsV2 } from "./execution-preflight";
import {
  confirmedStepRecordV2,
  parseConfirmedExecutionStepsV2,
  parseGuidedPreparedStepV2,
  preparedStepRecordV2,
} from "./guided-records";
import {
  prepareNextGuidedStepV2,
  resolveGuidedStepV2,
} from "./guided-session";
import { recoverGuidedSubmissionV2 } from "./guided-step";
import {
  executionMainnetCommitment,
  verifyExecutionMainnetProof,
} from "./mainnet-proof";

export type ExecutionAdvanceActionV2 =
  | { action: "submitted"; ordinal: number; transactionHash: Hash }
  | { action: "resolve"; ordinal: number }
  | { action: "recover"; ordinal: number };

const failureCodes = {
  "receipt-attribution": "RECEIPT_ATTRIBUTION",
  "receipt-reorged": "RECEIPT_REORGED",
  "transaction-reverted": "TRANSACTION_REVERTED",
  "protocol-event-missing": "PROTOCOL_EVENT_MISSING",
  "state-postcondition": "STATE_POSTCONDITION",
  "step-preflight": "STEP_PREFLIGHT",
} as const;

export function createExecutionService(dependencies: ExecutionServiceDependencies) {
  async function ensurePrepared(artifact: ExecutionArtifactV2, attemptId: string, nowSec: number) {
    const stored = await dependencies.executions.getAttempt(attemptId);
    if (!stored) throw new Error("Execution attempt is unavailable");
    if (stored.steps.some((step: StepRow) =>
      ["prepared", "submitted", "reconcile"].includes(step.state))) return stored;
    if (["complete", "failed", "reconcile"].includes(stored.state)) return stored;
    const verdict = await verifyFreshExecutionArtifactV2(dependencies, artifact, nowSec);
    const confirmed = parseConfirmedExecutionStepsV2(
      stored.steps.filter((step: StepRow) => step.state === "confirmed"),
    );
    const prepared = await prepareNextGuidedStepV2({
      policy: artifact.policy,
      bundle: artifact.bundle,
      verdict,
      nowSec,
      readClient: dependencies.readClient,
    }, confirmed);
    if (prepared.kind === "complete") {
      throw new Error("Purchased route has no remaining principal action");
    }
    const funding = await assertGuidedFundsV2(dependencies.readClient, {
      policy: artifact.policy,
      bundle: artifact.bundle,
      verdict,
    }, prepared);
    await dependencies.executions.prepareStep(
      preparedStepRecordV2(attemptId, stored.nextOrdinal, prepared, funding),
    );
    const updated = await dependencies.executions.getAttempt(attemptId);
    if (!updated) throw new Error("Prepared execution attempt is unavailable");
    return updated;
  }

  async function authenticatedAttempt(
    routeId: string,
    attemptId: string,
    token: string,
    nowSec: number,
  ) {
    const attempt = await dependencies.executions.getAttempt(attemptId);
    if (!attempt || attempt.routeId !== routeId.toLowerCase()) {
      throw new Error("Execution attempt does not belong to purchased route");
    }
    if (!isAddress(attempt.buyer)) throw new Error("Execution attempt buyer is invalid");
    const buyer = attempt.buyer.toLowerCase() as Address;
    const payload = await verifyAttemptToken(token, {
      attemptId,
      buyer,
    }, dependencies.sessionSecret, nowSec);
    const artifact = await loadExecutionArtifactV2(
      dependencies,
      routeId,
      buyer,
    );
    return { attempt, artifact, tokenExpiresAt: payload.expiresAt };
  }

  async function resolveSubmitted(
    artifact: ExecutionArtifactV2,
    attemptId: string,
    ordinal: number,
  ) {
    const attempt = await dependencies.executions.getAttempt(attemptId);
    const step = attempt?.steps.find((candidate) => candidate.ordinal === ordinal);
    if (!attempt || !step || step.state !== "submitted" || !step.transactionHash) {
      throw new Error("Execution step is not a submitted transaction");
    }
    const prepared = parseGuidedPreparedStepV2(step);
    const verdict = await verifyStoredExecutionArtifactV2(dependencies, artifact);
    const resolved = await resolveGuidedStepV2({
      policy: artifact.policy,
      bundle: artifact.bundle,
      verdict,
      nowSec: 0,
      readClient: dependencies.readClient,
      prepared,
      transactionHash: step.transactionHash as Hash,
      waitForReceiptPoll: dependencies.waitForReceiptPoll,
    });
    if (resolved.status === "pending") return;
    if (resolved.status === "failed") {
      await dependencies.executions.markReconcile(
        attemptId,
        ordinal,
        failureCodes[resolved.failure.code],
      );
      return;
    }
    const complete = resolved.transaction.label === "aave-v3-supply";
    await dependencies.executions.confirmStep(
      attemptId,
      ordinal,
      confirmedStepRecordV2(resolved.transaction, complete),
    );
    if (!complete) {
      try {
        await ensurePrepared(artifact, attemptId, dependencies.nowSec());
      } catch {
        // The confirmed prefix remains durable. An expired next action is not prepared.
      }
    }
  }

  return {
    async start(routeIdValue: string, proofValue: unknown, signature: Hex) {
      const nowSec = dependencies.nowSec();
      const proof = await verifyExecutionMainnetProof(proofValue, signature, nowSec);
      const routeId = routeIdValue.toLowerCase();
      if (proof.realm !== dependencies.realm || proof.routeId !== routeId ||
        proof.bundleHash !== routeId) {
        throw new Error("Mainnet execution proof does not match route and realm");
      }
      const artifact = await loadExecutionArtifactV2(dependencies, routeId, proof.buyer);
      const rehearsalTraceHash = artifact.rehearsal.traceHash;
      if (typeof rehearsalTraceHash !== "string" ||
        proof.rehearsalTraceHash.toLowerCase() !== rehearsalTraceHash.toLowerCase()) {
        throw new Error("Mainnet execution proof does not match passing rehearsal");
      }
      const existing = await dependencies.executions.getByRoute(routeId);
      let attemptId = existing?.id;
      if (!attemptId) {
        await verifyFreshExecutionArtifactV2(dependencies, artifact, nowSec);
        const begun = await dependencies.executions.begin({
          routeId,
          bundleHash: commitment(artifact.bundle),
          buyer: proof.buyer,
          executionChainId: 196,
          rehearsalId: artifact.rehearsal.id,
          rehearsalTraceHash,
          proofHash: executionMainnetCommitment(proof),
          proofNonce: proof.nonce,
          proofExpiresAt: new Date(proof.expiresAt * 1_000),
          nowSec,
        });
        attemptId = begun.id;
      }
      const attempt = await ensurePrepared(artifact, attemptId, nowSec);
      const token = await issueAttemptToken({
        attemptId: attempt.id,
        buyer: artifact.buyer,
        expiresAt: proof.expiresAt,
      }, dependencies.sessionSecret, nowSec);
      return executionSessionView(attempt, token, proof.expiresAt);
    },

    async read(routeId: string, attemptId: string, token: string) {
      const nowSec = dependencies.nowSec();
      const session = await authenticatedAttempt(routeId, attemptId, token, nowSec);
      return executionSessionView(session.attempt, token, session.tokenExpiresAt);
    },

    async advance(
      routeId: string,
      attemptId: string,
      token: string,
      action: ExecutionAdvanceActionV2,
    ) {
      const nowSec = dependencies.nowSec();
      const session = await authenticatedAttempt(routeId, attemptId, token, nowSec);
      const step = session.attempt.steps.find((candidate) => candidate.ordinal === action.ordinal);
      if (!step) throw new Error("Execution step is unavailable");
      if (action.action === "submitted") {
        if (step.state !== "prepared") throw new Error("Execution step is not prepared");
        await dependencies.executions.bindSubmittedHash(
          attemptId,
          action.ordinal,
          action.transactionHash,
        );
      } else if (action.action === "recover") {
        if (step.state !== "prepared") throw new Error("Execution step is not prepared");
        const recovered = await recoverGuidedSubmissionV2(
          dependencies.readClient,
          parseGuidedPreparedStepV2(step),
        );
        if (recovered) {
          await dependencies.executions.bindSubmittedHash(attemptId, action.ordinal, recovered);
        }
      }
      const afterAction = await dependencies.executions.getAttempt(attemptId);
      const current = afterAction?.steps.find((candidate) => candidate.ordinal === action.ordinal);
      if (current?.state === "submitted") {
        await resolveSubmitted(session.artifact, attemptId, action.ordinal);
      }
      const updated = await dependencies.executions.getAttempt(attemptId);
      if (!updated) throw new Error("Execution attempt is unavailable after update");
      return executionSessionView(updated, token, session.tokenExpiresAt);
    },
  };
}
