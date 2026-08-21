import { and, desc, eq, inArray } from "drizzle-orm";
import type { Address } from "viem";
import type { CobiaDatabase } from "./client";
import {
  cobiaActivityEvents,
  cobiaIntents,
  cobiaProgramArtifactsV2,
  cobiaSolverSubmissions,
} from "./schema";

export interface WalletActivityEvent {
  id: string;
  wallet: string;
  executionChainId: number;
  paymentId: string | null;
  kind: string;
  status: string;
  routeId: string | null;
  transactionHash: string | null;
  detail: Record<string, unknown>;
  occurredAt: Date;
}

function normalizeAddress(address: string): Address {
  return address.toLowerCase() as Address;
}

function transactionHash(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).transactionHash;
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? value.toLowerCase()
    : null;
}

export function createActivityRepository(db: CobiaDatabase) {
  return {
    async listActivity(
      wallet: string,
      executionChainId: number,
      observedAt: Date = new Date(),
    ): Promise<WalletActivityEvent[]> {
      const normalizedWallet = normalizeAddress(wallet);
      const [stored, intents] = await Promise.all([
        db.query.cobiaActivityEvents.findMany({
          where: and(
            eq(cobiaActivityEvents.wallet, normalizedWallet),
            eq(cobiaActivityEvents.executionChainId, executionChainId),
          ),
          orderBy: [desc(cobiaActivityEvents.occurredAt)],
        }),
        db.query.cobiaIntents.findMany({
          where: and(
            eq(cobiaIntents.owner, normalizedWallet),
            eq(cobiaIntents.chainId, executionChainId),
          ),
        }),
      ]);
      const intentIds = intents.map(({ id }) => id);
      const submissions = intentIds.length === 0 ? [] : await db.select({
        submissionId: cobiaSolverSubmissions.id,
        intentId: cobiaSolverSubmissions.intentId,
        state: cobiaSolverSubmissions.state,
        validUntil: cobiaSolverSubmissions.validUntil,
        payload: cobiaProgramArtifactsV2.payload,
        receiptCreatedAt: cobiaProgramArtifactsV2.createdAt,
      }).from(cobiaSolverSubmissions).leftJoin(
        cobiaProgramArtifactsV2,
        and(
          eq(cobiaProgramArtifactsV2.submissionId, cobiaSolverSubmissions.id),
          eq(cobiaProgramArtifactsV2.kind, "receipt"),
        ),
      ).where(inArray(cobiaSolverSubmissions.intentId, intentIds));
      const base = {
        wallet: normalizedWallet,
        executionChainId,
        paymentId: null,
        routeId: null,
        transactionHash: null,
      };
      const lifecycle = intents.flatMap<WalletActivityEvent>((intent) => {
        const events: WalletActivityEvent[] = [{
          ...base,
          id: `${intent.id}:created`,
          kind: "intent_created",
          status: "recorded",
          detail: { intentId: intent.id },
          occurredAt: intent.createdAt,
        }];
        if (intent.state === "collecting" && intent.competitionClosesAt <= observedAt) {
          events.push({
            ...base,
            id: `${intent.id}:closed`,
            kind: "intent_closed",
            status: "closed",
            detail: { intentId: intent.id },
            occurredAt: intent.competitionClosesAt,
          });
        }
        return events;
      });
      const programs = submissions.flatMap<WalletActivityEvent>((submission) => {
        if (!submission.intentId) return [];
        const detail = { intentId: submission.intentId, submissionId: submission.submissionId };
        if (submission.state === "executed" && submission.receiptCreatedAt) return [{
          ...base,
          id: `${submission.submissionId}:executed`,
          kind: "program_executed",
          status: "confirmed",
          transactionHash: transactionHash(submission.payload),
          detail,
          occurredAt: submission.receiptCreatedAt,
        }];
        if (["verified", "attested"].includes(submission.state) && submission.validUntil <= observedAt) {
          return [{
            ...base,
            id: `${submission.submissionId}:expired`,
            kind: "program_expired",
            status: "expired",
            detail,
            occurredAt: submission.validUntil,
          }];
        }
        return [];
      });
      return [...stored, ...lifecycle, ...programs]
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    },
  };
}
