import { and, eq } from "drizzle-orm";
import { hashPaymentReceiptHeader, parsePaymentReceiptHeader } from "../payments/receipt";
import { RevealProofSchema, revealProofCommitment } from "../payments/reveal-proof";
import { PaymentTermsSchema } from "../payments/terms";
import type { CobiaDatabase } from "./client";
import {
  assertHash,
  assertPaymentContext,
  assertStoredCredential,
  assertStoredInput,
  parseCredentialValidAfter,
  parsePayment,
  parsePurchase,
  requireRow,
  validateStoredPaymentRound,
  type BeginPaymentInput,
} from "./payment-records";
import {
  cobiaActivityEvents,
  cobiaPayments,
  cobiaQuotes,
  cobiaRequests,
  cobiaRoutePurchases,
} from "./schema";
export function createPaymentRepository(db: CobiaDatabase) {
  return {
    async beginPayment(inputValue: BeginPaymentInput) {
      const proof = RevealProofSchema.parse(inputValue.proof);
      const terms = PaymentTermsSchema.parse(inputValue.terms);
      assertHash(inputValue.proofHash, "Reveal proof hash");
      if (revealProofCommitment(proof) !== inputValue.proofHash.toLowerCase()) {
        throw new Error("Reveal proof hash does not match the proof");
      }
      const input = { proof, proofHash: inputValue.proofHash, terms };
      return db.transaction(async (tx) => {
        const requestRow = requireRow(
          await tx.select().from(cobiaRequests)
            .where(eq(cobiaRequests.id, proof.requestId)).for("update"),
          "Payment request is unavailable",
        );
        const existing = (await tx.select().from(cobiaPayments)
          .where(eq(cobiaPayments.requestId, proof.requestId)))[0];
        if (existing) {
          assertStoredInput(existing, input);
          return parsePayment(existing);
        }
        if (terms.expiresAt * 1_000 <= Date.now()) {
          throw new Error("Payment terms expired before attempt creation");
        }
        if (requestRow.state !== "selected") {
          throw new Error("Payment requires a selected request");
        }
        const quoteRow = requireRow(
          await tx.select().from(cobiaQuotes).where(and(
            eq(cobiaQuotes.id, proof.quoteId),
            eq(cobiaQuotes.requestId, proof.requestId),
          )),
          "Selected payment quote is unavailable",
        );
        assertPaymentContext(requestRow, quoteRow, proof, terms);
        const created = requireRow(await tx.insert(cobiaPayments).values({
          requestId: proof.requestId,
          quoteId: proof.quoteId,
          payer: proof.owner,
          paymentChainId: terms.paymentChainId,
          executionChainId: proof.executionChainId,
          realm: terms.realm,
          currency: terms.currency,
          decimals: terms.decimals,
          amountAtomic: terms.amount,
          recipient: terms.recipient,
          feePayer: terms.feePayer,
          splits: terms.splits,
          externalId: terms.externalId,
          paymentTerms: terms,
          paymentTermsHash: proof.paymentTermsHash,
          issuedAt: new Date(terms.issuedAt * 1_000),
          expiresAt: new Date(terms.expiresAt * 1_000),
          revealProofHash: input.proofHash.toLowerCase(),
          revealNonce: proof.nonce,
          proofExpiresAt: new Date(proof.expiresAt * 1_000),
        }).returning(), "Payment attempt was not stored");
        requireRow(await tx.update(cobiaRequests).set({
          state: "payment_pending",
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaRequests.id, proof.requestId),
          eq(cobiaRequests.state, "selected"),
        )).returning({ id: cobiaRequests.id }), "Payment request changed concurrently");
        return parsePayment(created);
      });
    },

    async getPaymentByRequest(requestId: string) {
      const row = await db.query.cobiaPayments.findFirst({
        where: eq(cobiaPayments.requestId, requestId),
      });
      return row ? parsePayment(row) : undefined;
    },

    async bindChallenge(paymentId: string, challengeId: string) {
      if (!challengeId.trim() || challengeId.length > 256) {
        throw new Error("Payment challenge ID is invalid");
      }
      return db.transaction(async (tx) => {
        const row = requireRow(
          await tx.select().from(cobiaPayments)
            .where(eq(cobiaPayments.id, paymentId)).for("update"),
          "Payment attempt is unavailable",
        );
        if (row.challengeId === challengeId) return parsePayment(row);
        // A fresh owner proof may rotate an unspent challenge; a bound credential never moves.
        if (row.state !== "pending" || row.credentialHash) {
          throw new Error("Payment challenge cannot be changed");
        }
        return parsePayment(requireRow(await tx.update(cobiaPayments).set({
          challengeId,
          updatedAt: new Date(),
        }).where(eq(cobiaPayments.id, paymentId)).returning(), "Payment challenge was not stored"));
      });
    },

    async bindCredential(paymentId: string, credentialHash: string, validAfterSec: number) {
      assertHash(credentialHash, "Credential hash");
      const authorizationValidAfter = parseCredentialValidAfter(validAfterSec);
      return db.transaction(async (tx) => {
        const row = requireRow(
          await tx.select().from(cobiaPayments)
            .where(eq(cobiaPayments.id, paymentId)).for("update"),
          "Payment attempt is unavailable",
        );
        if (!row.challengeId) throw new Error("Payment challenge must be stored first");
        if (row.credentialHash || row.authorizationValidAfter) {
          assertStoredCredential(row, credentialHash, authorizationValidAfter);
          return parsePayment(row);
        }
        if (row.expiresAt.getTime() <= Date.now()) {
          throw new Error("Payment terms expired before credential binding");
        }
        if (row.state !== "pending") throw new Error("Payment credential cannot be changed");
        if (authorizationValidAfter.getTime() >= row.expiresAt.getTime()) {
          throw new Error("Credential validAfter is outside the payment window");
        }
        return parsePayment(requireRow(await tx.update(cobiaPayments).set({
          credentialHash: credentialHash.toLowerCase(),
          authorizationValidAfter,
          updatedAt: new Date(),
        }).where(eq(cobiaPayments.id, paymentId)).returning(), "Payment credential was not stored"));
      });
    },

    async recordSettlement(paymentId: string, receiptHeader: string) {
      const receipt = parsePaymentReceiptHeader(receiptHeader);
      const receiptHash = hashPaymentReceiptHeader(receiptHeader);
      return db.transaction(async (tx) => {
        const row = requireRow(
          await tx.select().from(cobiaPayments)
            .where(eq(cobiaPayments.id, paymentId)).for("update"),
          "Payment attempt is unavailable",
        );
        if (row.state !== "pending") {
          if (row.receiptHeader !== receiptHeader) throw new Error("Payment receipt conflicts");
          return parsePayment(row);
        }
        if (!row.challengeId || !row.credentialHash || !row.authorizationValidAfter) {
          throw new Error("Payment challenge and credential must be bound before settlement");
        }
        if (receipt.challengeId !== row.challengeId) {
          throw new Error("Payment receipt challenge does not match");
        }
        if (receipt.externalId !== row.externalId.toLowerCase()) {
          throw new Error("Payment receipt external ID does not match");
        }
        const receiptTimestamp = new Date(receipt.timestamp);
        if (
          receiptTimestamp.getTime() < Math.max(
            row.authorizationValidAfter.getTime(),
            row.issuedAt.getTime(),
          )
          || receiptTimestamp.getTime() >= row.expiresAt.getTime()
        ) throw new Error("Payment receipt timestamp is outside the authorized window");

        const updated = requireRow(await tx.update(cobiaPayments).set({
          state: "settled",
          receiptHeader,
          receiptHash,
          receiptPayload: receipt,
          receiptMethod: receipt.method,
          receiptStatus: receipt.status,
          receiptReference: receipt.reference,
          receiptTimestamp,
          receiptChainId: receipt.chainId,
          receiptChallengeId: receipt.challengeId,
          receiptExternalId: receipt.externalId,
          settledAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaPayments.id, paymentId),
          eq(cobiaPayments.state, "pending"),
        )).returning(), "Payment settlement changed concurrently");
        requireRow(await tx.update(cobiaRequests).set({
          state: "paid",
          paymentReceiptHash: receiptHash,
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaRequests.id, row.requestId),
          eq(cobiaRequests.state, "payment_pending"),
        )).returning({ id: cobiaRequests.id }), "Payment request is not pending");
        return parsePayment(updated);
      });
    },

    async finalizePayment(paymentId: string) {
      return db.transaction(async (tx) => {
        const payment = requireRow(
          await tx.select().from(cobiaPayments)
            .where(eq(cobiaPayments.id, paymentId)).for("update"),
          "Payment attempt is unavailable",
        );
        if (payment.state === "finalized") {
          const purchase = requireRow(
            await tx.select().from(cobiaRoutePurchases)
              .where(eq(cobiaRoutePurchases.paymentId, paymentId)),
            "Finalized payment purchase is unavailable",
          );
          return { payment: parsePayment(payment), purchase: parsePurchase(purchase) };
        }
        if (payment.state !== "settled" || !payment.receiptHash || !payment.receiptTimestamp) {
          throw new Error("Payment must be settled before finalization");
        }
        const request = requireRow(
          await tx.select().from(cobiaRequests)
            .where(eq(cobiaRequests.id, payment.requestId)).for("update"),
          "Paid request is unavailable",
        );
        const quote = requireRow(
          await tx.select().from(cobiaQuotes).where(and(
            eq(cobiaQuotes.id, payment.quoteId),
            eq(cobiaQuotes.requestId, payment.requestId),
          )),
          "Paid quote is unavailable",
        );
        const artifacts = validateStoredPaymentRound(request, quote);
        const bundle = artifacts.bundle;
        if (
          request.state !== "paid"
          || request.selectedQuoteId !== payment.quoteId
          || !artifacts.eligible
          || !quote.executable
          || artifacts.quote.quoteId !== payment.quoteId
        ) throw new Error("Paid request context changed before finalization");

        const purchase = requireRow(await tx.insert(cobiaRoutePurchases).values({
          id: payment.quoteId,
          requestId: payment.requestId,
          quoteId: payment.quoteId,
          buyer: payment.payer,
          executionChainId: payment.executionChainId,
          paymentChainId: payment.paymentChainId,
          paymentId: payment.id,
          receiptHash: payment.receiptHash,
          bundle,
          purchasedAt: payment.receiptTimestamp,
        }).returning(), "Payment purchase was not stored");
        await tx.insert(cobiaActivityEvents).values({
          id: payment.id,
          wallet: payment.payer,
          executionChainId: payment.executionChainId,
          paymentId: payment.id,
          kind: "route_revealed",
          status: "confirmed",
          routeId: payment.quoteId,
          detail: {
            quoteId: payment.quoteId,
            receiptHash: payment.receiptHash,
            paymentChainId: payment.paymentChainId,
            executionChainId: payment.executionChainId,
          },
          occurredAt: payment.receiptTimestamp,
        });
        requireRow(await tx.update(cobiaRequests).set({
          state: "revealed",
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaRequests.id, payment.requestId),
          eq(cobiaRequests.state, "paid"),
        )).returning({ id: cobiaRequests.id }), "Paid request changed concurrently");
        const finalized = requireRow(await tx.update(cobiaPayments).set({
          state: "finalized",
          finalizedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(cobiaPayments.id, paymentId),
          eq(cobiaPayments.state, "settled"),
        )).returning(), "Payment finalization changed concurrently");
        return { payment: parsePayment(finalized), purchase: parsePurchase(purchase) };
      });
    },
  };
}
