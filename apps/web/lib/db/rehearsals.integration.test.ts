import { commitment } from "@cobia/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildExecutionRehearsalProof,
  executionRehearsalCommitment,
} from "../execution-v2/rehearsal-proof";
import { registryHash } from "../adapters/registry";
import { startIntegrationDatabase } from "./integration-database";
import { createRehearsalRepository } from "./rehearsals";
import {
  createRepositoryFixtureV2,
  freshReceiptHash,
} from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { cobiaRequests, cobiaRoutePurchases } from "./schema";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;
type RehearsalRepository = ReturnType<typeof createRehearsalRepository>;

let database: IntegrationDatabase | undefined;
let rehearsals: RehearsalRepository | undefined;

function repository(): RehearsalRepository {
  if (!rehearsals) throw new Error("Integration database did not start");
  return rehearsals;
}

async function purchasedRoute() {
  if (!database) throw new Error("Integration database did not start");
  const fixture = await createRepositoryFixtureV2();
  const requests = createRequestRepository(database.db);
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  await requests.saveQuote(
    fixture.policy.requestId,
    fixture.bundle,
    fixture.verdict,
    fixture.quote,
  );
  await requests.markQuotesReady(fixture.policy.requestId);
  await database.db.insert(cobiaRoutePurchases).values({
    id: fixture.quote.quoteId,
    requestId: fixture.policy.requestId,
    quoteId: fixture.quote.quoteId,
    buyer: fixture.policy.owner.toLowerCase(),
    executionChainId: 196,
    paymentChainId: 1952,
    receiptHash: freshReceiptHash(),
    bundle: fixture.bundle,
    purchasedAt: new Date("2026-08-11T08:00:00.000Z"),
  });
  await database.db.update(cobiaRequests).set({
    state: "revealed",
    selectedQuoteId: fixture.quote.quoteId,
  }).where(eq(cobiaRequests.id, fixture.policy.requestId));
  return fixture;
}

function proofFor(
  fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>,
  nonce = `0x${"11".repeat(32)}` as const,
) {
  return buildExecutionRehearsalProof({
    realm: "localhost:3000",
    routeId: fixture.quote.quoteId,
    bundleHash: commitment(fixture.bundle),
    buyer: fixture.policy.owner,
    executionChainId: 196,
    nonce,
    expiresAt: 2_000_000_240,
  });
}

const trace = {
  status: "success",
  transactions: [{ label: "aave-v3-supply", hash: `0x${"33".repeat(32)}` }],
};

const completion = {
  registryHash,
  snapshotBlockHash: `0x${"bc".repeat(32)}` as const,
  engineVersion: "execution-v2@1",
  traceHash: commitment(trace),
  trace,
};

beforeAll(async () => {
  database = await startIntegrationDatabase();
  rehearsals = createRehearsalRepository(database.db);
});

afterAll(async () => {
  await database?.close();
});

describe("fork rehearsal repository", () => {
  it("creates one running attempt and returns an exact retry", async () => {
    const fixture = await purchasedRoute();
    const proof = proofFor(fixture);
    const input = {
      proof,
      proofHash: executionRehearsalCommitment(proof),
      nowSec: 2_000_000_000,
    };

    const first = await repository().begin(input);
    const retry = await repository().begin(input);

    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      routeId: fixture.quote.quoteId,
      bundleHash: fixture.quote.quoteId,
      buyer: fixture.policy.owner.toLowerCase(),
      state: "running",
      proofNonce: proof.nonce,
    });
  });

  it("rejects nonce replay on a different purchased route", async () => {
    const first = await purchasedRoute();
    const second = await purchasedRoute();
    const firstProof = proofFor(first, `0x${"44".repeat(32)}`);
    const secondProof = proofFor(second, firstProof.nonce);
    await repository().begin({
      proof: firstProof,
      proofHash: executionRehearsalCommitment(firstProof),
      nowSec: 2_000_000_000,
    });

    await expect(repository().begin({
      proof: secondProof,
      proofHash: executionRehearsalCommitment(secondProof),
      nowSec: 2_000_000_000,
    })).rejects.toThrow();
  });

  it("stores one exact passing trace and rejects changed completion", async () => {
    const fixture = await purchasedRoute();
    const proof = proofFor(fixture, `0x${"55".repeat(32)}`);
    const attempt = await repository().begin({
      proof,
      proofHash: executionRehearsalCommitment(proof),
      nowSec: 2_000_000_000,
    });

    const passed = await repository().complete(attempt.id, completion);
    expect(await repository().complete(attempt.id, completion)).toEqual(passed);
    expect(await repository().findPassed(fixture.quote.quoteId, fixture.quote.quoteId))
      .toEqual(passed);
    const changedTrace = { ...trace, status: "changed" };
    await expect(repository().complete(attempt.id, {
      ...completion,
      traceHash: commitment(changedTrace),
      trace: changedTrace,
    })).rejects.toThrow("conflicts");
    await expect(repository().fail(attempt.id, "PROTOCOL_REJECTED"))
      .rejects.toThrow("cannot fail");
  });

  it("stores a safe failed state without passing trace fields", async () => {
    const fixture = await purchasedRoute();
    const proof = proofFor(fixture, `0x${"77".repeat(32)}`);
    const attempt = await repository().begin({
      proof,
      proofHash: executionRehearsalCommitment(proof),
      nowSec: 2_000_000_000,
    });

    await expect(repository().fail(attempt.id, "REHEARSAL_UNAVAILABLE"))
      .resolves.toMatchObject({
        state: "failed",
        failureCode: "REHEARSAL_UNAVAILABLE",
        trace: null,
      });
  });
});
