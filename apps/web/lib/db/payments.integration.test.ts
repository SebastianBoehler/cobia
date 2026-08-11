import { commitment } from "@cobia/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { buildRevealProof, revealProofCommitment } from "../payments/reveal-proof";
import { buildPaymentTerms, hashPaymentTerms } from "../payments/terms";
import { startIntegrationDatabase } from "./integration-database";
import { createPaymentRepository } from "./payments";
import { createRepositoryFixture, repositoryTestNowSec } from "./repository-test-fixtures";
import { cobiaActivityEvents, cobiaPayments, cobiaRoutePurchases } from "./schema";
import { createRequestRepository } from "./requests";
type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
type PaymentRepository = ReturnType<typeof createPaymentRepository>;
const treasury = "0x3333333333333333333333333333333333333333";
let database: Database | undefined;
let payments: PaymentRepository | undefined;

function paymentRepository(): PaymentRepository {
  if (!payments) throw new Error("Integration database did not start");
  return payments;
}
async function prepareAttempt() {
  if (!database) throw new Error("Integration database did not start");
  const fixture = await createRepositoryFixture();
  const requests = createRequestRepository(database.db);
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  await requests.saveQuote(fixture.policy.requestId, fixture.bundle, fixture.verdict, fixture.quote);
  await requests.markQuotesReady(fixture.policy.requestId);
  await requests.selectQuote(fixture.policy.requestId, fixture.quote.quoteId, repositoryTestNowSec);
  const terms = buildPaymentTerms({
    quote: fixture.quote, solver: fixture.quote.solverAddress, treasury,
    realm: "pay.cobia.example", issuedAt: repositoryTestNowSec, cutoff: fixture.quote.validUntil,
  });
  const proof = buildRevealProof({
    realm: terms.realm, requestId: fixture.policy.requestId, quoteId: fixture.quote.quoteId,
    owner: fixture.policy.owner, paymentChainId: terms.paymentChainId,
    executionChainId: fixture.policy.executionChainId,
    paymentTermsHash: hashPaymentTerms(terms),
    nonce: commitment({ nonce: crypto.randomUUID() }), expiresAt: terms.expiresAt,
  });
  const input = { proof, proofHash: revealProofCommitment(proof), terms };
  return { fixture, input };
}
async function beginAttempt() {
  const prepared = await prepareAttempt();
  return { ...prepared, attempt: await paymentRepository().beginPayment(prepared.input) };
}
function receiptHeader(input: {
  quoteId: string;
  challengeId: string;
  reference?: string;
  timestamp?: string;
}) {
  const receipt = {
    method: "evm",
    reference: input.reference ?? commitment({ reference: crypto.randomUUID() }),
    status: "success",
    timestamp: input.timestamp ?? new Date((repositoryTestNowSec + 30) * 1_000).toISOString(),
    chainId: 1952,
    challengeId: input.challengeId,
    externalId: input.quoteId,
  };
  return Buffer.from(JSON.stringify(receipt)).toString("base64url");
}
async function settleAttempt() {
  const started = await beginAttempt();
  const challengeId = `challenge-${crypto.randomUUID()}`;
  await paymentRepository().bindChallenge(started.attempt.id, challengeId);
  await paymentRepository().bindCredential(
    started.attempt.id,
    commitment({ credential: crypto.randomUUID() }),
    repositoryTestNowSec - 60,
  );
  const rawReceipt = receiptHeader({ quoteId: started.fixture.quote.quoteId, challengeId });
  const attempt = await paymentRepository().recordSettlement(started.attempt.id, rawReceipt);
  return { ...started, challengeId, rawReceipt, attempt };
}
beforeAll(async () => {
  database = await startIntegrationDatabase();
  payments = createPaymentRepository(database.db);
});
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000));
afterEach(() => vi.restoreAllMocks());
afterAll(async () => database?.close());

describe("durable payment saga", () => {
  it("persists one exact pending proof and terms before payment", async () => {
    if (!database) throw new Error("Integration database did not start");
    const started = await beginAttempt();

    expect(await paymentRepository().beginPayment(started.input)).toStrictEqual(started.attempt);
    expect(started.attempt).toMatchObject({
      state: "pending",
      payer: started.fixture.policy.owner.toLowerCase(),
      paymentChainId: 1952,
      executionChainId: 196,
      amountAtomic: "100000",
      paymentTermsHash: hashPaymentTerms(started.input.terms),
      revealNonce: started.input.proof.nonce,
    });
    expect(started.attempt.expiresAt).toBeInstanceOf(Date);
    expect(
      (await createRequestRepository(database.db)
        .getPublicRequest(started.fixture.policy.requestId))?.state,
    ).toBe("payment_pending");
    const changedProof = {
      ...started.input.proof,
      nonce: commitment({ nonce: crypto.randomUUID() }),
    };
    await expect(paymentRepository().beginPayment({
      ...started.input,
      proof: changedProof,
      proofHash: revealProofCommitment(changedProof),
    })).rejects.toThrow("conflicts");
  });
  it("rotates only an uncredentialed pending challenge", async () => {
    const started = await beginAttempt();
    await paymentRepository().bindChallenge(started.attempt.id, "old-challenge");
    expect((await paymentRepository().bindChallenge(started.attempt.id, "new-challenge"))
      .challengeId).toBe("new-challenge");
    await paymentRepository().bindCredential(
      started.attempt.id, commitment({ credential: crypto.randomUUID() }), repositoryTestNowSec - 60,
    );
    await expect(paymentRepository().bindChallenge(started.attempt.id, "third-challenge"))
      .rejects.toThrow("cannot be changed");
  });
  it("rejects payment writes that cross the stored expiry", async () => {
    const prepared = await prepareAttempt();
    vi.mocked(Date.now).mockReturnValue(prepared.input.terms.expiresAt * 1_000);
    await expect(paymentRepository().beginPayment(prepared.input)).rejects.toThrow("expired");
    vi.mocked(Date.now).mockReturnValue(repositoryTestNowSec * 1_000);
    const attempt = await paymentRepository().beginPayment(prepared.input);
    await paymentRepository().bindChallenge(attempt.id, "expiry-challenge");
    vi.mocked(Date.now).mockReturnValue(prepared.input.terms.expiresAt * 1_000);
    await expect(paymentRepository().bindCredential(
      attempt.id, commitment({ credential: crypto.randomUUID() }), repositoryTestNowSec - 60,
    )).rejects.toThrow("expired");
  });
  it("stores an exact raw receipt and rejects receipt replay", async () => {
    if (!database) throw new Error("Integration database did not start");
    const first = await settleAttempt();
    const restarted = createPaymentRepository(database.db);

    expect(await restarted.recordSettlement(first.attempt.id, first.rawReceipt))
      .toStrictEqual(first.attempt);
    expect(await restarted.getPaymentByRequest(first.fixture.policy.requestId)).toMatchObject({
      state: "settled",
      receiptHeader: first.rawReceipt,
      receiptChainId: 1952,
      receiptChallengeId: first.challengeId,
      receiptExternalId: first.fixture.quote.quoteId,
    });
    const second = await beginAttempt();
    const secondChallenge = `challenge-${crypto.randomUUID()}`;
    await restarted.bindChallenge(second.attempt.id, secondChallenge);
    await restarted.bindCredential(
      second.attempt.id,
      commitment({ credential: crypto.randomUUID() }),
      repositoryTestNowSec - 60,
    );
    const replayedReference = first.attempt.receiptReference;
    if (!replayedReference) throw new Error("Settlement reference missing");
    const caseVariedReference = `0x${replayedReference.slice(2).toUpperCase()}`;
    const replay = receiptHeader({
      quoteId: second.fixture.quote.quoteId,
      challengeId: secondChallenge,
      reference: caseVariedReference,
    });
    await expect(restarted.recordSettlement(second.attempt.id, replay)).rejects.toThrow();
    expect((await restarted.getPaymentByRequest(second.fixture.policy.requestId))?.state)
      .toBe("pending");
  });
  it("persists the exact credential window used for receipt timestamps", async () => {
    const started = await beginAttempt();
    const challengeId = `challenge-${crypto.randomUUID()}`;
    const credentialHash = commitment({ credential: crypto.randomUUID() });
    const validAfter = repositoryTestNowSec - 60;
    await paymentRepository().bindChallenge(started.attempt.id, challengeId);
    const bound = await paymentRepository().bindCredential(
      started.attempt.id,
      credentialHash,
      validAfter,
    );
    const conflictingRetryRejected = await paymentRepository().bindCredential(
      started.attempt.id,
      credentialHash,
      validAfter - 1,
    ).then(() => false, () => true);
    const tooEarlyRejected = await paymentRepository().recordSettlement(
      started.attempt.id,
      receiptHeader({
        quoteId: started.fixture.quote.quoteId,
        challengeId,
        timestamp: new Date((validAfter - 1) * 1_000).toISOString(),
      }),
    ).then(() => false, () => true);
    const beforeIssuanceRejected = await paymentRepository().recordSettlement(
      started.attempt.id,
      receiptHeader({
        quoteId: started.fixture.quote.quoteId,
        challengeId,
        timestamp: new Date((repositoryTestNowSec - 30) * 1_000).toISOString(),
      }),
    ).then(() => false, () => true);
    const receiptState = await paymentRepository().recordSettlement(
      started.attempt.id,
      receiptHeader({
        quoteId: started.fixture.quote.quoteId,
        challengeId,
        timestamp: new Date(repositoryTestNowSec * 1_000).toISOString(),
      }),
    ).then((payment) => payment.state, () => "rejected");

    expect({
      validAfter: bound.authorizationValidAfter?.getTime(),
      conflictingRetryRejected,
      tooEarlyRejected,
      beforeIssuanceRejected,
      receiptState,
    }).toStrictEqual({
      validAfter: validAfter * 1_000,
      conflictingRetryRejected: true,
      tooEarlyRejected: true,
      beforeIssuanceRejected: true,
      receiptState: "settled",
    });
  });
  it("rolls back a failed finalization, then finalizes exactly once after restart", async () => {
    if (!database) throw new Error("Integration database did not start");
    const settled = await settleAttempt();
    await database.db.insert(cobiaActivityEvents).values({
      id: settled.attempt.id,
      wallet: treasury,
      executionChainId: 196,
      kind: "signature",
      status: "confirmed",
      detail: {},
      occurredAt: new Date(),
    });
    await expect(paymentRepository().finalizePayment(settled.attempt.id)).rejects.toThrow();
    expect((await paymentRepository().getPaymentByRequest(settled.fixture.policy.requestId))?.state)
      .toBe("settled");
    expect(await database.db.query.cobiaRoutePurchases.findFirst({
      where: eq(cobiaRoutePurchases.paymentId, settled.attempt.id),
    })).toBeUndefined();
    await database.db.delete(cobiaActivityEvents)
      .where(eq(cobiaActivityEvents.id, settled.attempt.id));
    const restarted = createPaymentRepository(database.db);
    const [first, second] = await Promise.all([
      restarted.finalizePayment(settled.attempt.id),
      restarted.finalizePayment(settled.attempt.id),
    ]);
    expect(second).toStrictEqual(first);
    expect(first.payment.state).toBe("finalized");
    expect(first.purchase).toMatchObject({
      id: settled.fixture.quote.quoteId,
      paymentId: settled.attempt.id,
      executionChainId: 196,
      paymentChainId: 1952,
      buyer: settled.fixture.policy.owner.toLowerCase(),
      receiptHash: settled.attempt.receiptHash,
      bundle: settled.fixture.bundle,
    });
    expect(first.purchase.purchasedAt).toBeInstanceOf(Date);
    expect(
      (await createRequestRepository(database.db)
        .getPublicRequest(settled.fixture.policy.requestId))?.state,
    ).toBe("revealed");
    expect(await database.db.query.cobiaActivityEvents.findMany({
      where: eq(cobiaActivityEvents.paymentId, settled.attempt.id),
    })).toHaveLength(1);
  });
  it("rejects contradictory receipt-state projections at the database boundary", async () => {
    if (!database) throw new Error("Integration database did not start");
    const settled = await settleAttempt();
    const invalidSettled: Partial<typeof cobiaPayments.$inferInsert>[] = [
      { receiptMethod: "bogus" }, { receiptStatus: "failed" }, { receiptChainId: 196 },
      { receiptChainId: null }, { receiptChallengeId: "wrong" }, { receiptChallengeId: null },
      { receiptExternalId: `0x${"ff".repeat(32)}` }, { receiptExternalId: null },
      { receiptTimestamp: new Date((repositoryTestNowSec - 1) * 1_000) },
      { receiptTimestamp: new Date((repositoryTestNowSec + 240) * 1_000) },
      { authorizationValidAfter: new Date((repositoryTestNowSec + 31) * 1_000) },
    ];
    for (const mutation of invalidSettled) {
      await expect(database.db.update(cobiaPayments).set(mutation)
        .where(eq(cobiaPayments.id, settled.attempt.id))).rejects.toThrow();
    }
    const pending = await beginAttempt();
    for (const mutation of [
      { receiptChallengeId: "orphan" },
      { receiptExternalId: `0x${"ee".repeat(32)}` },
      { authorizationValidAfter: new Date() },
      { credentialHash: commitment({ credential: "late" }), authorizationValidAfter: pending.attempt.expiresAt, challengeId: "late" },
      { credentialHash: commitment({ credential: "unchallenged" }), authorizationValidAfter: new Date(repositoryTestNowSec * 1_000), challengeId: null },
    ]) {
      await expect(database.db.update(cobiaPayments).set(mutation)
        .where(eq(cobiaPayments.id, pending.attempt.id))).rejects.toThrow();
    }
  });
});
