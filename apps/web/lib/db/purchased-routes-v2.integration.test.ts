import { commitment } from "@cobia/domain";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildRevealProof, revealProofCommitment } from "../payments/reveal-proof";
import { buildPaymentTerms, hashPaymentTerms } from "../payments/terms";
import { eq } from "drizzle-orm";
import { startIntegrationDatabase } from "./integration-database";
import {
  createRepositoryFixture,
  createRepositoryFixtureV2,
  repositoryTestNowSec,
} from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { createPaymentRepository } from "./payments";
import { createPurchaseRepository } from "./purchases";
import { cobiaQuotes, cobiaRequests } from "./schema";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
type RequestRepository = ReturnType<typeof createRequestRepository>;

let database: Database | undefined;
let requests: RequestRepository | undefined;

async function selectedV2Round() {
  if (!requests) throw new Error("Integration database did not start");
  const fixture = await createRepositoryFixtureV2();
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  await requests.saveQuote(
    fixture.policy.requestId,
    fixture.bundle,
    fixture.verdict,
    fixture.quote,
  );
  await requests.markQuotesReady(fixture.policy.requestId);
  await requests.selectQuote(
    fixture.policy.requestId,
    fixture.quote.quoteId,
    repositoryTestNowSec,
  );
  return fixture;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  requests = createRequestRepository(database.db);
});

afterAll(async () => database?.close());
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000));
afterEach(() => vi.restoreAllMocks());

describe("V2 paid-route persistence boundaries", () => {
  it("reads a serialized V2 payment context with all committed artifacts", async () => {
    if (!requests) throw new Error("Integration database did not start");
    const fixture = await selectedV2Round();

    const context = await requests.getPaymentContext(
      fixture.policy.requestId,
      fixture.quote.quoteId,
    );

    expect(context).toMatchObject({
      requestId: fixture.policy.requestId,
      policy: { version: 2, requestId: fixture.policy.requestId },
      snapshot: { version: 2, requestId: fixture.policy.requestId },
      bundle: { version: 2, requestId: fixture.policy.requestId },
      verdict: {
        bundleHash: fixture.quote.quoteId,
        routeAuthorized: true,
      },
      quote: { version: 2, quoteId: fixture.quote.quoteId },
    });
    expect(context.quoteCreatedAt).toBeInstanceOf(Date);
  });

  it("rejects a stored policy-hash mismatch when loading payment context", async () => {
    if (!database || !requests) throw new Error("Integration database did not start");
    const fixture = await selectedV2Round();
    await database.db.update(cobiaRequests)
      .set({ policyHash: `0x${"de".repeat(32)}` })
      .where(eq(cobiaRequests.id, fixture.policy.requestId));

    await expect(requests.getPaymentContext(
      fixture.policy.requestId,
      fixture.quote.quoteId,
    )).rejects.toThrow(/commitment/i);
  });

  it("rejects a mixed-version bundle when loading payment context", async () => {
    if (!database || !requests) throw new Error("Integration database did not start");
    const fixture = await selectedV2Round();
    const legacy = await createRepositoryFixture();
    await database.db.update(cobiaQuotes).set({
      privateBundle: {
        ...legacy.bundle,
        requestId: fixture.policy.requestId,
      },
    }).where(eq(cobiaQuotes.id, fixture.quote.quoteId));

    await expect(requests.getPaymentContext(
      fixture.policy.requestId,
      fixture.quote.quoteId,
    )).rejects.toThrow(/version/i);
  });

  it("finalizes and reads an exact V2 purchased bundle", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await selectedV2Round();
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
    const attempt = await payments.beginPayment({
      proof,
      proofHash: revealProofCommitment(proof),
      terms,
    });
    const challengeId = `challenge-${crypto.randomUUID()}`;
    await payments.bindChallenge(attempt.id, challengeId);
    await payments.bindCredential(
      attempt.id,
      commitment({ credential: crypto.randomUUID() }),
      repositoryTestNowSec - 60,
    );
    const receipt = Buffer.from(JSON.stringify({
      method: "evm",
      reference: commitment({ receipt: crypto.randomUUID() }),
      status: "success",
      timestamp: new Date((repositoryTestNowSec + 30) * 1_000).toISOString(),
      chainId: 196,
      challengeId,
      externalId: fixture.quote.quoteId,
    })).toString("base64url");
    await payments.recordSettlement(attempt.id, receipt);
    const finalized = await payments.finalizePayment(attempt.id);

    expect(finalized.purchase.bundle).toStrictEqual(fixture.bundle);
    await expect(createPurchaseRepository(database.db).getPurchasedRoute(
      fixture.quote.quoteId,
      fixture.policy.owner,
    )).resolves.toMatchObject({ bundle: { version: 2 } });
  });
});
