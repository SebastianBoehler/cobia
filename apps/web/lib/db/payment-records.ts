import { PersistedBundleSchema } from "@cobia/domain";
import { isAddressEqual } from "viem";
import { EvmPaymentReceiptSchema } from "../payments/receipt";
import type { RevealProof } from "../payments/reveal-proof";
import {
  PaymentTermsSchema,
  hashPaymentTerms,
  type PaymentTerms,
} from "../payments/terms";
import { validatePersistedRoundArtifacts } from "./persisted-round";
import {
  cobiaPayments,
  cobiaQuotes,
  cobiaRequests,
  cobiaRoutePurchases,
} from "./schema";

const HASH = /^0x[0-9a-fA-F]{64}$/;
type PaymentRow = typeof cobiaPayments.$inferSelect;
type PurchaseRow = typeof cobiaRoutePurchases.$inferSelect;

export interface BeginPaymentInput {
  proof: RevealProof;
  proofHash: `0x${string}`;
  terms: PaymentTerms;
}

export function requireRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

export function parsePayment(row: PaymentRow) {
  return {
    ...row,
    paymentTerms: PaymentTermsSchema.parse(row.paymentTerms),
    receiptPayload: row.receiptPayload
      ? EvmPaymentReceiptSchema.parse(row.receiptPayload)
      : null,
  };
}

export function parsePurchase(row: PurchaseRow) {
  return { ...row, bundle: PersistedBundleSchema.parse(row.bundle) };
}

export function assertHash(value: string, field: string): void {
  if (!HASH.test(value)) throw new Error(`${field} must be a 32-byte hash`);
}

export function parseCredentialValidAfter(value: number): Date {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Credential validAfter is invalid");
  }
  return new Date(value * 1_000);
}

export function assertStoredCredential(
  row: PaymentRow,
  credentialHash: string,
  authorizationValidAfter: Date,
): void {
  if (
    row.credentialHash !== credentialHash.toLowerCase()
    || row.authorizationValidAfter?.getTime() !== authorizationValidAfter.getTime()
  ) throw new Error("Payment credential conflicts");
}

export function assertStoredInput(row: PaymentRow, input: BeginPaymentInput): void {
  if (
    row.revealProofHash !== input.proofHash.toLowerCase()
    || row.revealNonce !== input.proof.nonce
    || row.paymentTermsHash !== input.proof.paymentTermsHash
    || hashPaymentTerms(row.paymentTerms) !== hashPaymentTerms(input.terms)
    || row.proofExpiresAt.getTime() !== input.proof.expiresAt * 1_000
  ) throw new Error("Payment attempt conflicts with the stored proof or terms");
}

export function validateStoredPaymentRound(
  requestRow: typeof cobiaRequests.$inferSelect,
  quoteRow: typeof cobiaQuotes.$inferSelect,
) {
  if (!requestRow.snapshot) throw new Error("Payment snapshot is unavailable");
  return validatePersistedRoundArtifacts({
    requestId: requestRow.id,
    storedPolicy: requestRow.policy,
    storedPolicyHash: requestRow.policyHash,
    storedSnapshot: requestRow.snapshot,
    bundleInput: quoteRow.privateBundle,
    verdictInput: quoteRow.verdict,
    quoteInput: quoteRow.publicQuote,
  });
}

export function assertPaymentContext(
  requestRow: typeof cobiaRequests.$inferSelect,
  quoteRow: typeof cobiaQuotes.$inferSelect,
  proof: RevealProof,
  terms: PaymentTerms,
): void {
  const artifacts = validateStoredPaymentRound(requestRow, quoteRow);
  const { policy, quote } = artifacts;
  const matches = requestRow.selectedQuoteId === quote.quoteId
    && quoteRow.executable
    && artifacts.eligible
    && proof.requestId === requestRow.id
    && proof.quoteId === quote.quoteId.toLowerCase()
    && proof.realm === terms.realm
    && isAddressEqual(proof.owner, policy.owner)
    && proof.paymentChainId === terms.paymentChainId
    && proof.executionChainId === policy.executionChainId
    && proof.paymentTermsHash === hashPaymentTerms(terms)
    && proof.expiresAt === terms.expiresAt
    && terms.externalId.toLowerCase() === quote.quoteId.toLowerCase()
    && terms.amount === quote.priceAtomic
    && isAddressEqual(terms.recipient, quote.solverAddress);
  if (!matches) throw new Error("Payment proof or terms do not match the selected quote");
}
