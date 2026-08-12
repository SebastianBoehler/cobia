import { commitment } from "@cobia/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { buildRevealProof, revealProofCommitment } from "../payments/reveal-proof";
import { buildPaymentTerms, hashPaymentTerms } from "../payments/terms";
import { startIntegrationDatabase } from "./integration-database";
import { createPaymentRepository } from "./payments";
import { createRepositoryFixture, repositoryTestNowSec } from "./repository-test-fixtures";
import { cobiaPayments } from "./schema";
import { createRequestRepository } from "./requests";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;

beforeAll(async () => { database = await startIntegrationDatabase(); });
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000));
afterEach(() => vi.restoreAllMocks());
afterAll(async () => database?.close());

describe("payment network support constraint", () => {
  it("rejects mismatched payment-chain and currency pairs", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await createRepositoryFixture();
    const requests = createRequestRepository(database.db);
    await requests.createRequest(fixture.policy);
    await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
    await requests.saveQuote(
      fixture.policy.requestId, fixture.bundle, fixture.verdict, fixture.quote,
    );
    await requests.markQuotesReady(fixture.policy.requestId);
    await requests.selectQuote(
      fixture.policy.requestId, fixture.quote.quoteId, repositoryTestNowSec,
    );
    const terms = buildPaymentTerms({
      quote: fixture.quote,
      solver: fixture.quote.solverAddress,
      treasury: "0x3333333333333333333333333333333333333333",
      realm: "pay.cobia.example",
      issuedAt: repositoryTestNowSec,
      cutoff: fixture.quote.validUntil,
    });
    const proof = buildRevealProof({
      realm: terms.realm,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      owner: fixture.policy.owner,
      paymentChainId: terms.paymentChainId,
      executionChainId: fixture.policy.executionChainId,
      paymentTermsHash: hashPaymentTerms(terms),
      nonce: commitment({ nonce: crypto.randomUUID() }),
      expiresAt: terms.expiresAt,
    });
    const payments = createPaymentRepository(database.db);
    const pending = await payments.beginPayment({
      proof, proofHash: revealProofCommitment(proof), terms,
    });

    await expect(database.db.update(cobiaPayments).set({ paymentChainId: 1952 })
      .where(eq(cobiaPayments.id, pending.id))).rejects.toThrow();
    await expect(database.db.update(cobiaPayments)
      .set({ currency: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c" })
      .where(eq(cobiaPayments.id, pending.id))).rejects.toThrow();
    expect(await payments.getPaymentByRequest(fixture.policy.requestId))
      .toMatchObject({ paymentChainId: 196, currency: terms.currency });
  });
});
