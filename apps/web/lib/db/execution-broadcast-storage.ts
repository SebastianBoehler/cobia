import { and, eq } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { safeExecutionFailureCode } from "./execution-records";
import {
  executionActivity,
  requireExecutionRow as row,
} from "./execution-storage";
import { cobiaExecutionAttempts, cobiaExecutionSteps } from "./schema";

export function armExecutionStep(
  db: CobiaDatabase,
  attemptId: string,
  ordinal: number,
) {
  return db.transaction(async (tx) => {
    const attempt = row(await tx.select().from(cobiaExecutionAttempts)
      .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
    "Execution attempt is unavailable");
    const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
      eq(cobiaExecutionSteps.attemptId, attempt.id),
      eq(cobiaExecutionSteps.ordinal, ordinal),
    )).for("update"), "Execution step is unavailable");
    if (step.state === "broadcasting") return step;
    if (step.state !== "prepared") throw new Error("Only a prepared step can be armed");
    const now = new Date();
    const armed = row(await tx.update(cobiaExecutionSteps).set({
      state: "broadcasting", submittedAt: now, updatedAt: now,
    }).where(eq(cobiaExecutionSteps.id, step.id)).returning(),
    "Execution step was not armed");
    await executionActivity(tx, attempt, "execution_step_armed", "broadcasting", {
      ordinal, stepId: step.id,
    });
    return armed;
  });
}

export function cancelArmedExecutionStep(
  db: CobiaDatabase,
  attemptId: string,
  ordinal: number,
) {
  return db.transaction(async (tx) => {
    const attempt = row(await tx.select().from(cobiaExecutionAttempts)
      .where(eq(cobiaExecutionAttempts.id, attemptId)).for("update"),
    "Execution attempt is unavailable");
    const step = row(await tx.select().from(cobiaExecutionSteps).where(and(
      eq(cobiaExecutionSteps.attemptId, attempt.id),
      eq(cobiaExecutionSteps.ordinal, ordinal),
    )).for("update"), "Execution step is unavailable");
    if (step.state === "prepared") return step;
    if (step.state !== "broadcasting") throw new Error("Only an armed step can be cancelled");
    const prepared = row(await tx.update(cobiaExecutionSteps).set({
      state: "prepared", submittedAt: null, updatedAt: new Date(),
    }).where(eq(cobiaExecutionSteps.id, step.id)).returning(),
    "Armed execution step was not cancelled");
    await executionActivity(tx, attempt, "execution_step_cancelled", "prepared", {
      ordinal, stepId: step.id,
    });
    return prepared;
  });
}

export function reconcileExecutionStep(
  db: CobiaDatabase,
  attemptId: string,
  ordinal: number,
  codeValue: string,
) {
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
    if (!["broadcasting", "submitted"].includes(step.state)) {
      throw new Error("Only a broadcast step can reconcile");
    }
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
}
