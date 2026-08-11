import { PersistedBundleSchema, commitment } from "@cobia/domain";
import { and, desc, eq } from "drizzle-orm";
import { isAddress, isAddressEqual, type Address, type Hash } from "viem";
import {
  ExecutionRehearsalProofSchema,
  executionRehearsalCommitment,
  type ExecutionRehearsalProof,
} from "../execution-v2/rehearsal-proof";
import type { CobiaDatabase } from "./client";
import { cobiaExecutionRehearsals, cobiaRoutePurchases } from "./schema";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const failureCodes = [
  "REHEARSAL_UNAVAILABLE",
  "REHEARSAL_TIMEOUT",
  "PROTOCOL_REJECTED",
  "REHEARSAL_FAILED",
] as const;

export type RehearsalFailureCode = (typeof failureCodes)[number];
type RehearsalRow = typeof cobiaExecutionRehearsals.$inferSelect;

export interface BeginRehearsalInput {
  proof: ExecutionRehearsalProof;
  proofHash: Hash;
  nowSec: number;
}

export interface CompleteRehearsalInput {
  registryHash: Hash;
  snapshotBlockHash: Hash;
  engineVersion: string;
  traceHash: Hash;
  trace: Record<string, unknown>;
}

function requireRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

function hash(value: string, label: string): Hash {
  if (!HASH.test(value)) throw new Error(`${label} must be a 32-byte hash`);
  return value.toLowerCase() as Hash;
}

function sameAddress(value: string, expected: Address): boolean {
  return isAddress(value) && isAddressEqual(value, expected);
}

function assertBeginRetry(row: RehearsalRow, input: BeginRehearsalInput): void {
  const proof = input.proof;
  const matches = row.routeId.toLowerCase() === proof.routeId
    && row.bundleHash.toLowerCase() === proof.bundleHash
    && sameAddress(row.buyer, proof.buyer)
    && row.executionChainId === proof.executionChainId
    && row.proofHash === input.proofHash.toLowerCase()
    && row.proofNonce === proof.nonce
    && row.proofExpiresAt.getTime() === proof.expiresAt * 1_000;
  if (!matches) throw new Error("Execution rehearsal proof conflicts");
}

function assertCompletionRetry(
  row: RehearsalRow,
  input: CompleteRehearsalInput,
): void {
  const matches = row.registryHash === input.registryHash.toLowerCase()
    && row.snapshotBlockHash === input.snapshotBlockHash.toLowerCase()
    && row.engineVersion === input.engineVersion
    && row.traceHash === input.traceHash.toLowerCase()
    && row.trace !== null
    && commitment(row.trace) === input.traceHash.toLowerCase();
  if (!matches) throw new Error("Execution rehearsal completion conflicts");
}

export function createRehearsalRepository(db: CobiaDatabase) {
  return {
    async begin(inputValue: BeginRehearsalInput) {
      const proof = ExecutionRehearsalProofSchema.parse(inputValue.proof);
      const proofHash = hash(inputValue.proofHash, "Rehearsal proof hash");
      if (executionRehearsalCommitment(proof) !== proofHash) {
        throw new Error("Rehearsal proof hash does not match proof");
      }
      if (!Number.isSafeInteger(inputValue.nowSec) || inputValue.nowSec < 0
        || proof.expiresAt <= inputValue.nowSec
        || proof.expiresAt > inputValue.nowSec + 300) {
        throw new Error("Rehearsal proof is outside its allowed window");
      }
      const input = { ...inputValue, proof, proofHash };
      return db.transaction(async (tx) => {
        const existing = await tx.query.cobiaExecutionRehearsals.findFirst({
          where: eq(cobiaExecutionRehearsals.proofHash, proofHash),
        });
        if (existing) {
          assertBeginRetry(existing, input);
          return existing;
        }
        const purchase = requireRow(await tx.select().from(cobiaRoutePurchases)
          .where(eq(cobiaRoutePurchases.id, proof.routeId)).for("update"),
        "Purchased route is unavailable for rehearsal");
        const bundle = PersistedBundleSchema.parse(purchase.bundle);
        const matches = purchase.id.toLowerCase() === proof.routeId
          && commitment(bundle) === proof.bundleHash
          && sameAddress(purchase.buyer, proof.buyer)
          && purchase.executionChainId === proof.executionChainId;
        if (!matches) throw new Error("Rehearsal proof does not match purchased route");
        return requireRow(await tx.insert(cobiaExecutionRehearsals).values({
          routeId: proof.routeId,
          bundleHash: proof.bundleHash,
          buyer: proof.buyer,
          executionChainId: proof.executionChainId,
          proofHash,
          proofNonce: proof.nonce,
          proofExpiresAt: new Date(proof.expiresAt * 1_000),
        }).returning(), "Execution rehearsal was not stored");
      });
    },

    async complete(id: string, inputValue: CompleteRehearsalInput) {
      const input = {
        registryHash: hash(inputValue.registryHash, "Registry hash"),
        snapshotBlockHash: hash(inputValue.snapshotBlockHash, "Snapshot block hash"),
        engineVersion: inputValue.engineVersion.trim(),
        traceHash: hash(inputValue.traceHash, "Trace hash"),
        trace: inputValue.trace,
      };
      if (!input.engineVersion || commitment(input.trace) !== input.traceHash) {
        throw new Error("Execution rehearsal trace binding is invalid");
      }
      return db.transaction(async (tx) => {
        const row = requireRow(await tx.select().from(cobiaExecutionRehearsals)
          .where(eq(cobiaExecutionRehearsals.id, id)).for("update"),
        "Execution rehearsal is unavailable");
        if (row.state === "passed") {
          assertCompletionRetry(row, input);
          return row;
        }
        if (row.state !== "running") {
          throw new Error("Execution rehearsal completion conflicts");
        }
        return requireRow(await tx.update(cobiaExecutionRehearsals).set({
          state: "passed",
          ...input,
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaExecutionRehearsals.id, id),
          eq(cobiaExecutionRehearsals.state, "running"),
        )).returning(), "Execution rehearsal changed concurrently");
      });
    },

    async fail(id: string, failureCode: RehearsalFailureCode) {
      if (!failureCodes.includes(failureCode)) throw new Error("Rehearsal failure code is invalid");
      return db.transaction(async (tx) => {
        const row = requireRow(await tx.select().from(cobiaExecutionRehearsals)
          .where(eq(cobiaExecutionRehearsals.id, id)).for("update"),
        "Execution rehearsal is unavailable");
        if (row.state === "failed" && row.failureCode === failureCode) return row;
        if (row.state !== "running") throw new Error("Passed rehearsal cannot fail");
        return requireRow(await tx.update(cobiaExecutionRehearsals).set({
          state: "failed",
          failureCode,
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaExecutionRehearsals.id, id),
          eq(cobiaExecutionRehearsals.state, "running"),
        )).returning(), "Execution rehearsal changed concurrently");
      });
    },

    findPassed(routeId: string, bundleHash: string) {
      return db.query.cobiaExecutionRehearsals.findFirst({
        where: and(
          eq(cobiaExecutionRehearsals.routeId, routeId.toLowerCase()),
          eq(cobiaExecutionRehearsals.bundleHash, bundleHash.toLowerCase()),
          eq(cobiaExecutionRehearsals.state, "passed"),
        ),
        orderBy: [desc(cobiaExecutionRehearsals.completedAt)],
      });
    },
  };
}
