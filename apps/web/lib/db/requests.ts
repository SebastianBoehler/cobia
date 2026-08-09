import {
  DecisionBundleSchema,
  MarketSnapshotSchema,
  RouteQuoteSchema,
  StablecoinPolicySchema,
  VerificationVerdictSchema,
  commitment,
  type DecisionBundle,
  type MarketSnapshot,
  type RouteQuote,
  type StablecoinPolicy,
  type VerificationVerdict,
} from "@cobia/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { cobiaQuotes, cobiaRequests } from "./schema";

const selectableStates = ["quotes_ready", "partial"] as const;

function requireUpdated<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

export function createRequestRepository(db: CobiaDatabase) {
  return {
    async createRequest(input: StablecoinPolicy): Promise<void> {
      const policy = StablecoinPolicySchema.parse(input);
      await db.insert(cobiaRequests).values({
        id: policy.requestId,
        policy,
        policyHash: commitment(policy),
      });
    },

    async saveSnapshot(requestId: string, input: MarketSnapshot): Promise<void> {
      const snapshot = MarketSnapshotSchema.parse(input);
      if (snapshot.requestId !== requestId) throw new Error("Snapshot request mismatch");
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ snapshot, state: "collecting", updatedAt: new Date() })
          .where(and(eq(cobiaRequests.id, requestId), eq(cobiaRequests.state, "open")))
          .returning({ id: cobiaRequests.id }),
        "Request must be open before snapshot capture",
      );
    },

    async saveQuote(
      requestId: string,
      bundleInput: DecisionBundle,
      verdictInput: VerificationVerdict,
      quoteInput: RouteQuote,
    ): Promise<void> {
      const bundle = DecisionBundleSchema.parse(bundleInput);
      const verdict = VerificationVerdictSchema.parse(verdictInput);
      const quote = RouteQuoteSchema.parse(quoteInput);
      if (
        bundle.requestId !== requestId ||
        quote.requestId !== requestId ||
        quote.quoteId !== verdict.bundleHash ||
        quote.bundleHash !== commitment(bundle)
      ) {
        throw new Error("Quote commitment mismatch");
      }

      await db.transaction(async (tx) => {
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
          "Request is not accepting solver quotes",
        );
        await tx.insert(cobiaQuotes).values({
          id: quote.quoteId,
          requestId,
          solverId: bundle.solverId,
          privateBundle: bundle,
          verdict,
          publicQuote: quote,
          executable: verdict.executable,
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

    async getPublicRequest(requestId: string) {
      const request = await db.query.cobiaRequests.findFirst({
        where: eq(cobiaRequests.id, requestId),
      });
      if (!request) return undefined;
      const storedQuotes = await db.query.cobiaQuotes.findMany({
        columns: { publicQuote: true },
        where: eq(cobiaQuotes.requestId, requestId),
      });
      return {
        requestId: request.id,
        state: request.state,
        policy: StablecoinPolicySchema.parse(request.policy),
        snapshot: request.snapshot ? MarketSnapshotSchema.parse(request.snapshot) : null,
        selectedQuoteId: request.selectedQuoteId,
        quotes: storedQuotes.map(({ publicQuote }) => RouteQuoteSchema.parse(publicQuote)),
      };
    },

    async selectQuote(requestId: string, quoteId: string, nowSec: number): Promise<void> {
      const quoteRow = await db.query.cobiaQuotes.findFirst({
        where: and(
          eq(cobiaQuotes.id, quoteId),
          eq(cobiaQuotes.requestId, requestId),
          eq(cobiaQuotes.executable, true),
        ),
      });
      if (!quoteRow) throw new Error("No executable quote belongs to this request");
      const quote = RouteQuoteSchema.parse(quoteRow.publicQuote);
      if (quote.validUntil <= nowSec) throw new Error("Executable quote has expired");

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

    async recordPayment(requestId: string, receiptHash: string): Promise<void> {
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ paymentReceiptHash: receiptHash, state: "paid", updatedAt: new Date() })
          .where(
            and(
              eq(cobiaRequests.id, requestId),
              inArray(cobiaRequests.state, ["selected", "payment_pending"]),
            ),
          )
          .returning({ id: cobiaRequests.id }),
        "Payment requires a selected request",
      );
    },

    async markRevealed(requestId: string): Promise<void> {
      requireUpdated(
        await db
          .update(cobiaRequests)
          .set({ state: "revealed", updatedAt: new Date() })
          .where(and(eq(cobiaRequests.id, requestId), eq(cobiaRequests.state, "paid")))
          .returning({ id: cobiaRequests.id }),
        "Reveal requires a paid request",
      );
    },
  };
}
