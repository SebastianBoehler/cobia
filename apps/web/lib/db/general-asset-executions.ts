import { and, asc, eq } from "drizzle-orm";
import type { Hash } from "viem";
import {
  nextStageStateV4,
  type StageStateV4,
} from "../execution-v4/stage-machine";
import {
  reconcileReceiptV4,
  type ObservedReceiptV4,
  type ReceiptReconciliationInputV4,
} from "../execution-v4/receipt-reconciler";
import type { CobiaDatabase } from "./client";
import {
  assertGeneralAssetInputs,
  assertBridgeDeliveryEvidenceV4,
  assertCanonicalHashV4,
  assertProgramRetry,
  assertStageRetry,
  sameEvidenceV4,
  type BridgeDeliveryEvidenceV4,
  type GeneralAssetProgramRecordInputV4,
  type GeneralAssetStageRecordInputV4,
} from "./general-asset-execution-records";
import {
  cobiaGeneralAssetDeliveries,
  cobiaGeneralAssetPrograms,
  cobiaGeneralAssetReceipts,
  cobiaGeneralAssetStages,
} from "./general-asset-execution-schema";

type Transaction = Parameters<Parameters<CobiaDatabase["transaction"]>[0]>[0];
type StageRow = typeof cobiaGeneralAssetStages.$inferSelect;
function row<T>(rows: T[], message: string): T {
  const value = rows[0];
  if (!value) throw new Error(message);
  return value;
}
async function lockProgram(tx: Transaction, programId: string) {
  return row(await tx.select().from(cobiaGeneralAssetPrograms)
    .where(eq(cobiaGeneralAssetPrograms.id, programId)).for("update"),
  "General asset program is unavailable");
}
async function lockStage(tx: Transaction, programId: string, stageId: string) {
  return row(await tx.select().from(cobiaGeneralAssetStages).where(and(
    eq(cobiaGeneralAssetStages.programId, programId),
    eq(cobiaGeneralAssetStages.stageId, stageId),
  )).for("update"), "General asset stage is unavailable");
}
async function predecessorState(tx: Transaction, stage: StageRow): Promise<StageStateV4 | null> {
  if (!stage.predecessorStageId) return null;
  return (await lockStage(tx, stage.programId, stage.predecessorStageId)).state;
}
async function requireActiveProgram(tx: Transaction, programId: string) {
  const program = await lockProgram(tx, programId);
  if (program.state === "reconciliation_required") {
    throw new Error("General asset program requires manual reconciliation");
  }
  if (program.state !== "active") throw new Error("General asset program is already resolved");
  return program;
}
async function markReconciliation(
  tx: Transaction,
  stage: StageRow,
  code: string,
): Promise<StageRow> {
  if (stage.state === "reconciliation_required") {
    if (stage.failureCode !== code) throw new Error("Reconciliation evidence conflicts");
    return stage;
  }
  const now = new Date();
  const updated = row(await tx.update(cobiaGeneralAssetStages).set({
    state: "reconciliation_required", failureCode: code, updatedAt: now,
  }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(),
  "Stage reconciliation was not stored");
  await tx.update(cobiaGeneralAssetPrograms).set({
    state: "reconciliation_required", failureCode: code, completedAt: null, updatedAt: now,
  }).where(eq(cobiaGeneralAssetPrograms.id, stage.programId));
  return updated;
}

export function createGeneralAssetExecutionRepository(db: CobiaDatabase) {
  return {
    async prepareStage(input: {
      program: GeneralAssetProgramRecordInputV4;
      stage: GeneralAssetStageRecordInputV4;
    }) {
      assertGeneralAssetInputs(input.program, input.stage);
      return db.transaction(async (tx) => {
        const storedPrograms = await tx.select().from(cobiaGeneralAssetPrograms)
          .where(eq(cobiaGeneralAssetPrograms.id, input.program.programId)).for("update");
        let program = storedPrograms[0];
        if (!program) {
          program = row(await tx.insert(cobiaGeneralAssetPrograms).values({
            id: input.program.programId,
            canonicalProgramHash: input.program.canonicalProgramHash,
            owner: input.program.owner,
            finalOutputChainId: input.program.finalOutput.chainId,
            finalOutputToken: input.program.finalOutput.token,
            finalOutputMinimumAtomic: input.program.finalOutput.minimumAtomic,
          }).returning(), "General asset program was not stored");
        } else {
          assertProgramRetry(program, input.program);
        }
        const existing = await tx.select().from(cobiaGeneralAssetStages).where(and(
          eq(cobiaGeneralAssetStages.programId, input.program.programId),
          eq(cobiaGeneralAssetStages.stageId, input.stage.stageId),
        )).for("update");
        if (existing[0]) {
          assertStageRetry(existing[0], input.stage);
          return existing[0];
        }
        if (program.state === "reconciliation_required") {
          throw new Error("General asset program requires manual reconciliation");
        }
        if (program.state !== "active") throw new Error("General asset program is already resolved");
        let predecessor: StageStateV4 | null = null;
        if (input.stage.predecessorStageId) {
          const previous = await lockStage(tx, input.program.programId, input.stage.predecessorStageId);
          if (input.stage.ordinal !== previous.ordinal + 1) throw new Error("Stage predecessor ordinal is invalid");
          const delivery = previous.delivery;
          if (delivery.kind !== "bridge" || delivery.destinationChainId !== input.stage.chainId ||
              delivery.recipient !== input.stage.sender || delivery.token !== input.stage.inputToken) {
            throw new Error("Stage predecessor delivery does not bind the destination input");
          }
          predecessor = previous.state;
        } else if (input.stage.ordinal !== 0) {
          throw new Error("First stage ordinal is invalid");
        }
        nextStageStateV4({ state: "pending", event: "prepare", predecessorState: predecessor });
        const now = new Date();
        return row(await tx.insert(cobiaGeneralAssetStages).values({
          ...input.stage,
          state: "prepared",
          preparedAt: now,
          updatedAt: now,
        }).returning(), "General asset stage was not stored");
      });
    },

    async armStage(programId: string, stageId: string) {
      return db.transaction(async (tx) => {
        await requireActiveProgram(tx, programId);
        const stage = await lockStage(tx, programId, stageId);
        if (stage.state === "broadcasting") return stage;
        const state = nextStageStateV4({
          state: stage.state, event: "arm", predecessorState: await predecessorState(tx, stage),
        });
        const now = new Date();
        return row(await tx.update(cobiaGeneralAssetStages).set({
          state, armedAt: now, updatedAt: now,
        }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(), "Stage was not armed");
      });
    },

    async recordSubmission(programId: string, stageId: string, transactionHash: Hash) {
      assertCanonicalHashV4(transactionHash, "Transaction hash");
      return db.transaction(async (tx) => {
        const program = await lockProgram(tx, programId);
        const stage = await lockStage(tx, programId, stageId);
        if (stage.transactionHash === transactionHash &&
            ["submitted", "finalized", "delivered", "confirmed"].includes(stage.state)) return stage;
        if (program.state === "reconciliation_required") {
          throw new Error("General asset program requires manual reconciliation");
        }
        if (program.state !== "active") throw new Error("General asset program is already resolved");
        if (stage.transactionHash) return markReconciliation(tx, stage, "TRANSACTION_MISMATCH");
        const state = nextStageStateV4({ state: stage.state, event: "submit" });
        const now = new Date();
        return row(await tx.update(cobiaGeneralAssetStages).set({
          state, transactionHash, submittedAt: now, updatedAt: now,
        }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(),
        "Stage submission was not stored");
      });
    },

    async reconcileStageReceipt(programId: string, stageId: string, input: {
      observed: ObservedReceiptV4;
      currentBlockNumber: string;
      canonicalBlockHash: Hash;
      output?: ReceiptReconciliationInputV4["output"];
    }) {
      return db.transaction(async (tx) => {
        const program = await lockProgram(tx, programId);
        const stage = await lockStage(tx, programId, stageId);
        if (stage.state === "reconciliation_required") return stage;
        if (!stage.transactionHash || !["submitted", "finalized", "delivered", "confirmed"].includes(stage.state)) {
          throw new Error("Stage has no submitted transaction to reconcile");
        }
        const result = reconcileReceiptV4({
          expected: {
            chainId: stage.chainId, transactionHash: stage.transactionHash as Hash,
            sender: stage.sender as `0x${string}`, nonce: stage.expectedNonce,
            target: stage.target as `0x${string}`, valueAtomic: stage.valueAtomic,
            calldata: stage.calldata as `0x${string}`, logs: stage.expectedLogs,
          },
          observed: input.observed,
          currentBlockNumber: input.currentBlockNumber,
          canonicalBlockHash: input.canonicalBlockHash,
          requiredConfirmations: stage.requiredConfirmations,
          output: input.output,
        });
        if (result.status === "pending") return stage;
        if (result.status === "reconciliation_required") {
          return markReconciliation(tx, stage, result.code);
        }
        const receipt = await tx.select().from(cobiaGeneralAssetReceipts)
          .where(eq(cobiaGeneralAssetReceipts.stageRecordId, stage.id)).for("update");
        if (receipt[0] && (!sameEvidenceV4(receipt[0].receipt, result.receipt) ||
            receipt[0].canonicalBlockHash !== input.canonicalBlockHash)) {
          return markReconciliation(tx, stage, "RECEIPT_REORGED");
        }
        if (!receipt[0]) await tx.insert(cobiaGeneralAssetReceipts).values({
          stageRecordId: stage.id, transactionHash: stage.transactionHash,
          receipt: result.receipt, canonicalBlockHash: input.canonicalBlockHash,
        });
        if (stage.delivery.kind === "none") {
          const expected = input.output?.expected;
          if (!expected || stage.chainId !== program.finalOutputChainId ||
              expected.token !== program.finalOutputToken ||
              expected.minimumIncreaseAtomic !== program.finalOutputMinimumAtomic) {
            return markReconciliation(tx, stage, "FINAL_OUTPUT_MISMATCH");
          }
        }
        if (stage.state === "delivered" || stage.state === "confirmed") return stage;
        const now = new Date();
        const finalized = stage.state === "submitted"
          ? row(await tx.update(cobiaGeneralAssetStages).set({
            state: "finalized", finalizedAt: now, updatedAt: now,
          }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(), "Finality was not stored")
          : stage;
        if (stage.delivery.kind === "bridge") return finalized;
        const confirmed = row(await tx.update(cobiaGeneralAssetStages).set({
          state: "confirmed", confirmedAt: now, updatedAt: now,
        }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(), "Confirmation was not stored");
        await tx.update(cobiaGeneralAssetPrograms).set({
          state: "confirmed", completedAt: now, updatedAt: now,
        }).where(eq(cobiaGeneralAssetPrograms.id, programId));
        return confirmed;
      });
    },

    async recordBridgeDelivery(
      programId: string,
      stageId: string,
      evidence: BridgeDeliveryEvidenceV4,
    ) {
      assertBridgeDeliveryEvidenceV4(evidence);
      return db.transaction(async (tx) => {
        const program = await lockProgram(tx, programId);
        const stage = await lockStage(tx, programId, stageId);
        const existing = await tx.select().from(cobiaGeneralAssetDeliveries)
          .where(eq(cobiaGeneralAssetDeliveries.stageRecordId, stage.id)).for("update");
        if (existing[0]) {
          const storedEvidence: BridgeDeliveryEvidenceV4 = {
            messageId: existing[0].messageId as Hash,
            sourceTransactionHash: existing[0].sourceTransactionHash as Hash,
            destinationChainId: existing[0].destinationChainId as 1 | 196,
            recipient: existing[0].recipient as `0x${string}`,
            token: existing[0].token as `0x${string}`,
            amountAtomic: existing[0].amountAtomic,
            deliveryTransactionHash: existing[0].deliveryTransactionHash as Hash,
          };
          if (sameEvidenceV4(storedEvidence, evidence)) return stage;
          return markReconciliation(tx, stage, "BRIDGE_DELIVERY_MISMATCH");
        }
        if (program.state === "reconciliation_required") {
          throw new Error("General asset program requires manual reconciliation");
        }
        if (program.state !== "active") throw new Error("General asset program is already resolved");
        const delivery = stage.delivery;
        const matches = delivery.kind === "bridge" && stage.transactionHash === evidence.sourceTransactionHash &&
          delivery.destinationChainId === evidence.destinationChainId && delivery.recipient === evidence.recipient &&
          delivery.token === evidence.token && BigInt(evidence.amountAtomic) >= BigInt(delivery.minimumAtomic);
        if (!matches) return markReconciliation(tx, stage, "BRIDGE_DELIVERY_MISMATCH");
        const state = nextStageStateV4({
          state: stage.state, event: "record_delivery", deliveryKind: delivery.kind,
        });
        await tx.insert(cobiaGeneralAssetDeliveries).values({ stageRecordId: stage.id, ...evidence });
        const now = new Date();
        return row(await tx.update(cobiaGeneralAssetStages).set({
          state, deliveredAt: now, updatedAt: now,
        }).where(eq(cobiaGeneralAssetStages.id, stage.id)).returning(), "Delivery was not stored");
      });
    },

    async getProgram(programId: string) {
      const program = await db.query.cobiaGeneralAssetPrograms.findFirst({
        where: eq(cobiaGeneralAssetPrograms.id, programId),
      });
      if (!program) return null;
      const stages = await db.query.cobiaGeneralAssetStages.findMany({
        where: eq(cobiaGeneralAssetStages.programId, programId),
        orderBy: [asc(cobiaGeneralAssetStages.ordinal)],
      });
      return { ...program, stages };
    },
  };
}
