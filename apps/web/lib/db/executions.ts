import { commitment } from "@cobia/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Hash } from "viem";
import type { CobiaDatabase } from "./client";
import {
  BeginExecutionInputSchema,
  ConfirmExecutionStepInputSchema,
  PrepareExecutionStepInputSchema,
  safeExecutionFailureCode,
  type BeginExecutionInput,
  type ConfirmExecutionStepInput,
  type PrepareExecutionStepInput,
} from "./execution-records";
import {
  assertAttemptRetry,
  assertStepRetry,
  executionActivity,
  requireExecutionRow as row,
  sameExecutionJson as sameJson,
} from "./execution-storage";
import {
  cobiaExecutionAttempts,
  cobiaExecutionRehearsals,
  cobiaExecutionSteps,
  cobiaRoutePurchases,
} from "./schema";

export function createExecutionRepository(db: CobiaDatabase) {
  return {
    async begin(inputValue: BeginExecutionInput) {
      const input = BeginExecutionInputSchema.parse(inputValue);
      return db.transaction(async (tx) => {
        const purchase = row(await tx.select().from(cobiaRoutePurchases)
          .where(eq(cobiaRoutePurchases.id, input.routeId)).for("update"),
        "Purchased route is unavailable for execution");
        const existing = await tx.query.cobiaExecutionAttempts.findFirst({
          where: eq(cobiaExecutionAttempts.routeId, input.routeId),
        });
        if (existing) {
          assertAttemptRetry(existing, input);
          return existing;
        }
        const rehearsal = row(await tx.select().from(cobiaExecutionRehearsals)
          .where(eq(cobiaExecutionRehearsals.id, input.rehearsalId)).for("update"),
        "Passing execution rehearsal is unavailable");
        const matches = purchase.id === input.routeId
          && purchase.buyer === input.buyer
          && purchase.executionChainId === input.executionChainId
          && commitment(purchase.bundle) === input.bundleHash
          && rehearsal.state === "passed"
          && rehearsal.routeId === input.routeId
          && rehearsal.bundleHash === input.bundleHash
          && rehearsal.buyer === input.buyer
          && rehearsal.executionChainId === input.executionChainId
          && rehearsal.traceHash === input.rehearsalTraceHash;
        if (!matches) throw new Error("Execution attempt does not match purchase and rehearsal");
        const attempt = row(await tx.insert(cobiaExecutionAttempts).values({
          routeId: input.routeId,
          rehearsalId: input.rehearsalId,
          rehearsalTraceHash: input.rehearsalTraceHash,
          bundleHash: input.bundleHash,
          buyer: input.buyer,
          executionChainId: input.executionChainId,
          proofHash: input.proofHash,
          proofNonce: input.proofNonce,
          proofExpiresAt: input.proofExpiresAt,
        }).returning(), "Execution attempt was not stored");
        await executionActivity(tx, attempt, "execution_started", "prepared", {
          rehearsalId: input.rehearsalId,
          rehearsalTraceHash: input.rehearsalTraceHash,
        });
        return attempt;
      });
    },

    async prepareStep(inputValue: PrepareExecutionStepInput) {
      const input = PrepareExecutionStepInputSchema.parse(inputValue);
      return db.transaction(async (tx) => {
        const attempt = row(await tx.select().from(cobiaExecutionAttempts)
          .where(eq(cobiaExecutionAttempts.id, input.attemptId)).for("update"),
        "Execution attempt is unavailable");
        const existing = await tx.query.cobiaExecutionSteps.findFirst({
          where: and(
            eq(cobiaExecutionSteps.attemptId, attempt.id),
            eq(cobiaExecutionSteps.ordinal, input.ordinal),
          ),
        });
        if (existing) {
          assertStepRetry(existing, input);
          return existing;
        }
        if (attempt.state === "reconcile") {
          throw new Error("Execution attempt requires reconciliation");
        }
        if (["failed", "complete"].includes(attempt.state)) {
          throw new Error("Execution attempt is already resolved");
        }
        const unresolved = await tx.query.cobiaExecutionSteps.findFirst({
          where: and(
            eq(cobiaExecutionSteps.attemptId, attempt.id),
            inArray(cobiaExecutionSteps.state, ["prepared", "submitted", "reconcile"]),
          ),
        });
        if (unresolved) throw new Error("Execution attempt has an unresolved step");
        if (input.ordinal !== attempt.nextOrdinal) {
          throw new Error("Execution step ordinal is not next");
        }
        const prepared = row(await tx.insert(cobiaExecutionSteps).values({
          attemptId: attempt.id,
          ordinal: input.ordinal,
          kind: input.kind,
          from: input.from,
          to: input.to,
          valueAtomic: input.valueAtomic,
          calldata: input.data,
          calldataHash: input.calldataHash,
          semantic: input.semantic,
          preBlockNumber: input.preBlockNumber,
          preBlockHash: input.preBlockHash,
          expectedNonce: input.expectedNonce,
          gasEstimateAtomic: input.gasEstimateAtomic,
        }).returning(), "Execution step was not stored");
        await tx.update(cobiaExecutionAttempts).set({ state: "active", updatedAt: new Date() })
          .where(eq(cobiaExecutionAttempts.id, attempt.id));
        await executionActivity(tx, attempt, "execution_step_prepared", "prepared", {
          ordinal: input.ordinal,
          stepId: prepared.id,
          kind: input.kind,
          calldataHash: input.calldataHash,
        });
        return prepared;
      });
    },

    async bindSubmittedHash(attemptId: string, ordinal: number, value: Hash) {
      const transactionHash = value.toLowerCase() as Hash;
      return db.transaction(async (tx) => {
        const attempt = row(await tx.select().from(cobiaExecutionAttempts)
          .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
        "Execution attempt is unavailable");
        const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
          eq(cobiaExecutionSteps.attemptId, attempt.id),
          eq(cobiaExecutionSteps.ordinal, ordinal),
        )).for("update"), "Execution step is unavailable");
        if (step.state !== "prepared") {
          if (step.transactionHash === transactionHash) return step;
          throw new Error("Submitted transaction hash conflicts");
        }
        const submitted = row(await tx.update(cobiaExecutionSteps).set({
          state: "submitted",
          transactionHash,
          submittedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(cobiaExecutionSteps.id, step.id)).returning(),
        "Submitted transaction was not stored");
        await executionActivity(tx, attempt, "execution_step_submitted", "pending", {
          ordinal,
          stepId: step.id,
        }, transactionHash);
        return submitted;
      });
    },

    async confirmStep(
      attemptId: string,
      ordinal: number,
      inputValue: ConfirmExecutionStepInput,
    ) {
      const input = ConfirmExecutionStepInputSchema.parse(inputValue);
      return db.transaction(async (tx) => {
        const attempt = row(await tx.select().from(cobiaExecutionAttempts)
          .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
        "Execution attempt is unavailable");
        const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
          eq(cobiaExecutionSteps.attemptId, attempt.id),
          eq(cobiaExecutionSteps.ordinal, ordinal),
        )).for("update"), "Execution step is unavailable");
        if (step.state === "confirmed") {
          const exact = step.transactionHash === input.transactionHash
            && sameJson(step.receipt, input.receipt)
            && sameJson(step.evidence, input.evidence)
            && sameJson(step.postcondition, input.postcondition);
          if (!exact) throw new Error("Confirmed execution step conflicts");
          return { attempt, step };
        }
        if (step.state !== "submitted" || step.transactionHash !== input.transactionHash) {
          throw new Error("Execution step is not the submitted transaction");
        }
        const resolvedAt = new Date();
        const confirmed = row(await tx.update(cobiaExecutionSteps).set({
          state: "confirmed",
          receipt: input.receipt,
          evidence: input.evidence,
          postcondition: input.postcondition,
          resolvedAt,
          updatedAt: resolvedAt,
        }).where(eq(cobiaExecutionSteps.id, step.id)).returning(),
        "Confirmed execution step was not stored");
        const updated = row(await tx.update(cobiaExecutionAttempts).set({
          state: input.complete ? "complete" : "partial",
          nextOrdinal: ordinal + 1,
          completedAt: input.complete ? resolvedAt : null,
          updatedAt: resolvedAt,
        }).where(eq(cobiaExecutionAttempts.id, attempt.id)).returning(),
        "Execution attempt confirmation was not stored");
        await executionActivity(tx, updated, input.complete ? "execution_completed" : "execution_step_confirmed",
          "confirmed", { ordinal, stepId: step.id }, input.transactionHash);
        return { attempt: updated, step: confirmed };
      });
    },

    async markReconcile(attemptId: string, ordinal: number, codeValue: string) {
      const failureCode = safeExecutionFailureCode(codeValue);
      return db.transaction(async (tx) => {
        const attempt = row(await tx.select().from(cobiaExecutionAttempts)
          .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
        "Execution attempt is unavailable");
        const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
          eq(cobiaExecutionSteps.attemptId, attempt.id),
          eq(cobiaExecutionSteps.ordinal, ordinal),
        )).for("update"), "Execution step is unavailable");
        if (step.state === "reconcile" && step.failureCode === failureCode) {
          return { attempt, step };
        }
        if (step.state !== "submitted") throw new Error("Only a submitted step can reconcile");
        const updatedAt = new Date();
        const reconciledStep = row(await tx.update(cobiaExecutionSteps).set({
          state: "reconcile", failureCode, updatedAt,
        }).where(eq(cobiaExecutionSteps.id, step.id)).returning(), "Step reconciliation failed");
        const reconciledAttempt = row(await tx.update(cobiaExecutionAttempts).set({
          state: "reconcile", updatedAt,
        }).where(eq(cobiaExecutionAttempts.id, attempt.id)).returning(),
        "Attempt reconciliation failed");
        await executionActivity(tx, reconciledAttempt, "execution_reconciliation", "reconcile", {
          ordinal, stepId: step.id, failureCode,
        }, step.transactionHash ?? undefined);
        return { attempt: reconciledAttempt, step: reconciledStep };
      });
    },

    async failStep(attemptId: string, ordinal: number, codeValue: string) {
      const failureCode = safeExecutionFailureCode(codeValue);
      return db.transaction(async (tx) => {
        const attempt = row(await tx.select().from(cobiaExecutionAttempts)
          .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
        "Execution attempt is unavailable");
        const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
          eq(cobiaExecutionSteps.attemptId, attempt.id),
          eq(cobiaExecutionSteps.ordinal, ordinal),
        )).for("update"), "Execution step is unavailable");
        if (step.state === "failed" && step.failureCode === failureCode) return { attempt, step };
        if (step.state !== "prepared") throw new Error("Broadcast steps cannot fail without reconciliation");
        const completedAt = new Date();
        const failedStep = row(await tx.update(cobiaExecutionSteps).set({
          state: "failed", failureCode, resolvedAt: completedAt, updatedAt: completedAt,
        }).where(eq(cobiaExecutionSteps.id, step.id)).returning(), "Step failure was not stored");
        const failedAttempt = row(await tx.update(cobiaExecutionAttempts).set({
          state: "failed", failureCode, completedAt, updatedAt: completedAt,
        }).where(eq(cobiaExecutionAttempts.id, attempt.id)).returning(),
        "Attempt failure was not stored");
        await executionActivity(tx, failedAttempt, "execution_failed", "failed", {
          ordinal, stepId: step.id, failureCode,
        });
        return { attempt: failedAttempt, step: failedStep };
      });
    },

    async getAttempt(attemptId: string) {
      const attempt = await db.query.cobiaExecutionAttempts.findFirst({
        where: eq(cobiaExecutionAttempts.id, attemptId),
      });
      if (!attempt) return null;
      const steps = await db.query.cobiaExecutionSteps.findMany({
        where: eq(cobiaExecutionSteps.attemptId, attempt.id),
        orderBy: [asc(cobiaExecutionSteps.ordinal)],
      });
      return { ...attempt, steps };
    },

    async getByRoute(routeId: string) {
      const attempt = await db.query.cobiaExecutionAttempts.findFirst({
        where: eq(cobiaExecutionAttempts.routeId, routeId.toLowerCase()),
      });
      if (!attempt) return null;
      const steps = await db.query.cobiaExecutionSteps.findMany({
        where: eq(cobiaExecutionSteps.attemptId, attempt.id),
        orderBy: [asc(cobiaExecutionSteps.ordinal)],
      });
      return { ...attempt, steps };
    },

    findRecoverable(buyer: string) {
      return db.query.cobiaExecutionAttempts.findMany({
        where: and(
          eq(cobiaExecutionAttempts.buyer, buyer.toLowerCase()),
          inArray(cobiaExecutionAttempts.state, ["prepared", "active", "partial", "reconcile"]),
        ),
        orderBy: [desc(cobiaExecutionAttempts.updatedAt)],
      });
    },
  };
}
