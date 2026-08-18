import {
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
  PersistedIntentPolicySchema,
  commitment,
  type PersistedBundle,
  type PersistedRouteQuote,
  type PersistedIntentPolicy,
  type PersistedIntentSnapshot,
  type PersistedVerificationVerdict,
  type RouteVerificationVerdictV2,
} from "@cobia/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { marketAsset, marketIdentity, verifyStoredMarketIdentity } from "./market-identity";
import {
  parsePublicPersistedQuote,
  validatePersistedRoundArtifacts,
  validateRoundArtifacts,
  validateSnapshotArtifact,
} from "./persisted-round";
import { readPublicRequest } from "./public-request";
import { cobiaMarkets, cobiaQuotes, cobiaRequests } from "./schema";

const selectableStates = ["quotes_ready", "partial"] as const;

function validateGeneralSnapshot(
  requestId: string,
  policyInput: unknown,
  snapshotInput: unknown,
) {
  const policy = GeneralIntentPolicyV2Schema.parse(policyInput);
  const snapshot = GeneralIntentSnapshotV1Schema.parse(snapshotInput);
  if (policy.requestId !== requestId || snapshot.requestId !== requestId ||
    snapshot.manifestHash !== policy.manifestHash) {
    throw new Error("General intent snapshot commitment mismatch");
  }
  return snapshot;
}

function requireUpdated<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

export function createRequestRepository(db: CobiaDatabase) {
  return {
    async createRequest(input: PersistedIntentPolicy): Promise<void> {
      const policy = PersistedIntentPolicySchema.parse(input);
      const marketId = marketIdentity(policy);
      await db.transaction(async (tx) => {
        const inserted = await tx.insert(cobiaMarkets).values({
          id: marketId,
          executionChainId: policy.executionChainId,
          asset: marketAsset(policy),
        }).onConflictDoNothing({ target: cobiaMarkets.id }).returning({ id: cobiaMarkets.id });
        if (!inserted[0]) {
          const stored = await tx.query.cobiaMarkets.findFirst({
            where: eq(cobiaMarkets.id, marketId),
          });
          if (!stored) throw new Error("Conflicting market identity disappeared");
          verifyStoredMarketIdentity(stored, policy);
        }
        await tx.insert(cobiaRequests).values({
          id: policy.requestId,
          marketId,
          policy: policy as never,
          policyHash: commitment(policy),
        });
      });
    },

    async saveSnapshot(requestId: string, input: PersistedIntentSnapshot): Promise<void> {
      await db.transaction(async (tx) => {
        const request = await tx.query.cobiaRequests.findFirst({
          columns: { policy: true },
          where: eq(cobiaRequests.id, requestId),
        });
        if (!request) throw new Error("Request must be open before snapshot capture");
        const snapshot = request.policy && typeof request.policy === "object" &&
          "kind" in request.policy && request.policy.kind === "general-onchain"
          ? validateGeneralSnapshot(requestId, request.policy, input)
          : validateSnapshotArtifact(requestId, request.policy, input);
        requireUpdated(
          await tx
          .update(cobiaRequests)
            .set({ snapshot: snapshot as never, state: "collecting", updatedAt: new Date() })
          .where(and(eq(cobiaRequests.id, requestId), eq(cobiaRequests.state, "open")))
          .returning({ id: cobiaRequests.id }),
          "Request must be open before snapshot capture",
        );
      });
    },

    async saveQuote(
      requestId: string,
      bundleInput: PersistedBundle,
      verdictInput: PersistedVerificationVerdict | RouteVerificationVerdictV2,
      quoteInput: PersistedRouteQuote,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        const request = await tx.query.cobiaRequests.findFirst({
          columns: { policy: true, policyHash: true, snapshot: true },
          where: eq(cobiaRequests.id, requestId),
        });
        if (!request?.snapshot) throw new Error("Request is not accepting a quote");
        const { bundle, verdict, quote, eligible } = validateRoundArtifacts({
          requestId,
          storedPolicy: request.policy,
          storedPolicyHash: request.policyHash,
          storedSnapshot: request.snapshot,
          bundleInput,
          verdictInput,
          quoteInput,
        });
        requireUpdated(
          await tx
            .update(cobiaRequests)
            .set({ state: "verifying", updatedAt: new Date() })
            .where(
              and(
                eq(cobiaRequests.id, requestId),
                inArray(cobiaRequests.state, ["collecting", "verifying"]),
              ),
            )
            .returning({ id: cobiaRequests.id }),
          "Request is not accepting a quote",
        );
        await tx.insert(cobiaQuotes).values({
          id: quote.quoteId,
          requestId,
          solverId: bundle.solverId,
          privateBundle: bundle,
          verdict,
          publicQuote: quote,
          executable: eligible,
        });
      });
    },

    async markQuotesReady(requestId: string): Promise<void> {
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ state: "quotes_ready", updatedAt: new Date() })
          .where(
            and(
              eq(cobiaRequests.id, requestId),
              inArray(cobiaRequests.state, ["collecting", "verifying"]),
            ),
          )
          .returning({ id: cobiaRequests.id }),
        "Request is not collecting quotes",
      );
    },

    async finishMarket(
      requestId: string,
      state: "quotes_ready" | "agent_ready" | "partial" | "failed",
    ): Promise<void> {
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ state, updatedAt: new Date() })
          .where(
            and(
              eq(cobiaRequests.id, requestId),
              inArray(cobiaRequests.state, ["collecting", "verifying"]),
            ),
          )
          .returning({ id: cobiaRequests.id }),
        "Request market is not active",
      );
    },

    async failRequest(requestId: string): Promise<void> {
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ state: "failed", updatedAt: new Date() })
          .where(
            and(
              eq(cobiaRequests.id, requestId),
              inArray(cobiaRequests.state, ["open", "collecting", "verifying"]),
            ),
          )
          .returning({ id: cobiaRequests.id }),
        "Request cannot transition to failed",
      );
    },

    async getPublicRequest(
      requestId: string,
      nowSec = Math.floor(Date.now() / 1_000),
    ) {
      return readPublicRequest(db, requestId, nowSec);
    },

    async selectQuote(requestId: string, quoteId: string, nowSec: number): Promise<void> {
      const quoteRow = await db.query.cobiaQuotes.findFirst({
        where: and(
          eq(cobiaQuotes.id, quoteId),
          eq(cobiaQuotes.requestId, requestId),
          eq(cobiaQuotes.executable, true),
        ),
      });
      if (!quoteRow) throw new Error("No eligible quote belongs to this request");
      const quote = parsePublicPersistedQuote(quoteRow.publicQuote);
      if (quote.validUntil <= nowSec) throw new Error("Eligible quote has expired");

      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ selectedQuoteId: quoteId, state: "selected", updatedAt: new Date() })
          .where(
            and(
              eq(cobiaRequests.id, requestId),
              inArray(cobiaRequests.state, [...selectableStates]),
            ),
          )
          .returning({ id: cobiaRequests.id }),
        "Request is not ready for quote selection",
      );
    },

    async getPaymentContext(requestId: string, quoteId: string) {
      const row = (await db.select({ request: cobiaRequests, quote: cobiaQuotes })
        .from(cobiaRequests)
        .innerJoin(cobiaQuotes, and(
          eq(cobiaQuotes.requestId, cobiaRequests.id),
          eq(cobiaQuotes.id, cobiaRequests.selectedQuoteId),
        ))
        .where(and(
          eq(cobiaRequests.id, requestId),
          eq(cobiaQuotes.id, quoteId),
          inArray(cobiaRequests.state, ["selected", "payment_pending", "paid", "revealed"]),
        )))[0];
      if (!row) throw new Error("Payment requires the selected quote");
      if (!row.request.snapshot) throw new Error("Selected quote snapshot is unavailable");
      const artifacts = validatePersistedRoundArtifacts({
        requestId: row.request.id,
        storedPolicy: row.request.policy,
        storedPolicyHash: row.request.policyHash,
        storedSnapshot: row.request.snapshot,
        bundleInput: row.quote.privateBundle,
        verdictInput: row.quote.verdict,
        quoteInput: row.quote.publicQuote,
      });
      if (!artifacts.eligible || !row.quote.executable) {
        throw new Error("Payment requires an eligible selected quote");
      }
      const common = {
        requestId: row.request.id,
        state: row.request.state,
        quoteCreatedAt: row.quote.createdAt,
      };
      return artifacts.version === 1
        ? {
            ...common,
            policy: artifacts.policy,
            snapshot: artifacts.snapshot,
            bundle: artifacts.bundle,
            verdict: artifacts.verdict,
            quote: artifacts.quote,
          }
        : {
            ...common,
            policy: artifacts.policy,
            snapshot: artifacts.snapshot,
            bundle: artifacts.bundle,
            verdict: artifacts.verdict,
            quote: artifacts.quote,
          };
    },

  };
}
