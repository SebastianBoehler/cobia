import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createMarketRepository } from "./markets";
import {
  createRepositoryFixture,
  repositoryTestNowSec,
} from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { cobiaMarkets, cobiaRequests } from "./schema";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;

let database: IntegrationDatabase | undefined;

async function persistQuote(expired = false) {
  if (!database) throw new Error("Integration database did not start");
  const fixture = await createRepositoryFixture();
  const requests = createRequestRepository(database.db);
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  const quote = expired
    ? { ...fixture.quote, validUntil: repositoryTestNowSec }
    : fixture.quote;
  await requests.saveQuote(fixture.policy.requestId, fixture.bundle, fixture.verdict, quote);
  await requests.markQuotesReady(fixture.policy.requestId);
  return { ...fixture, quote };
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
});

afterAll(async () => {
  await database?.close();
});

beforeEach(async () => {
  if (!database) throw new Error("Integration database did not start");
  await database.db.delete(cobiaRequests);
  await database.db.delete(cobiaMarkets);
});

describe("market public projections", () => {
  it("does not publish a persisted bid before the request is ready", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await createRepositoryFixture();
    const requests = createRequestRepository(database.db);
    const markets = createMarketRepository(database.db);
    const marketId = `196:${fixture.policy.asset.toLowerCase()}`;
    await requests.createRequest(fixture.policy);
    await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
    await requests.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      fixture.verdict,
      fixture.quote,
    );

    expect((await markets.resolveMarket(marketId, repositoryTestNowSec))?.market)
      .toMatchObject({
        latestActiveAttempt: null,
        mostRecentAttempt: { state: "verifying", quotes: [], quoteEligibility: "none" },
      });

    await requests.markQuotesReady(fixture.policy.requestId);
    expect((await markets.resolveMarket(marketId, repositoryTestNowSec))?.market)
      .toMatchObject({
        latestActiveAttempt: { quotes: [{ quoteId: fixture.quote.quoteId }] },
        mostRecentAttempt: {
          state: "quotes_ready",
          quotes: [{ quoteId: fixture.quote.quoteId }],
          quoteEligibility: "active",
        },
      });
  });

  it("lists only the latest active attempt and SQL aggregate counts", async () => {
    if (!database) throw new Error("Integration database did not start");
    const active = await persistQuote();
    await persistQuote(true);

    const summaries = await createMarketRepository(database.db).listMarkets(repositoryTestNowSec);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      latestActiveAttempt: { requestId: active.policy.requestId },
      requestAttemptCount: 2,
      quoteBearingAttemptCount: 2,
    });
    expect(summaries[0]).not.toHaveProperty("attempts");
    expect(summaries[0]).not.toHaveProperty("history");
    expect(JSON.stringify(summaries[0])).not.toMatch(/privateBundle|verdict/);
  });

  it("keeps a market discoverable after its last published quote expires", async () => {
    if (!database) throw new Error("Integration database did not start");
    const expired = await persistQuote(true);

    const summaries = await createMarketRepository(database.db).listMarkets(repositoryTestNowSec);

    expect(summaries).toEqual([
      expect.objectContaining({
        id: `196:${expired.policy.asset.toLowerCase()}`,
        latestActiveAttempt: null,
        mostRecentAttempt: expect.objectContaining({
          requestId: expired.policy.requestId,
          quoteEligibility: "inactive",
          quotes: [expect.objectContaining({ quoteId: expired.quote.quoteId })],
        }),
        requestAttemptCount: 1,
        quoteBearingAttemptCount: 1,
      }),
    ]);
    expect(JSON.stringify(summaries[0])).not.toMatch(/privateBundle|verdict/);
  });

  it("paginates public attempt history by createdAt and requestId", async () => {
    if (!database) throw new Error("Integration database did not start");
    const first = await persistQuote();
    const second = await persistQuote();
    const third = await persistQuote();
    for (const fixture of [first, second, third]) {
      await database.db.update(cobiaRequests).set({
        createdAt: new Date(fixture === first
          ? "2026-08-11T00:00:01.000Z"
          : "2026-08-11T00:00:02.000Z"),
      }).where(eq(cobiaRequests.id, fixture.policy.requestId));
    }
    const tiedNewest = [second, third].sort((left, right) =>
      right.policy.requestId.localeCompare(left.policy.requestId));
    const repository = createMarketRepository(database.db);
    const marketId = `196:${first.policy.asset.toLowerCase()}`;

    const firstPage = await repository.resolveMarket(marketId, repositoryTestNowSec, { limit: 1 });
    const secondPage = await repository.resolveMarket(marketId, repositoryTestNowSec, {
      limit: 1,
      cursor: firstPage?.market.nextCursor ?? undefined,
    });

    expect(firstPage?.market).toMatchObject({
      mostRecentAttempt: { requestId: tiedNewest[0]!.policy.requestId },
      attempts: [{ requestId: tiedNewest[0]!.policy.requestId }],
    });
    expect(firstPage?.market.nextCursor).toEqual(expect.any(String));
    expect(secondPage?.market.attempts).toEqual([
      expect.objectContaining({ requestId: tiedNewest[1]!.policy.requestId }),
    ]);
  });

  it("keeps request lifecycle separate from quote eligibility", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await createRepositoryFixture();
    await createRequestRepository(database.db).createRequest(fixture.policy);
    const repository = createMarketRepository(database.db);
    const marketId = `196:${fixture.policy.asset.toLowerCase()}`;

    expect(await repository.listMarkets(repositoryTestNowSec)).toEqual([
      expect.objectContaining({
        id: marketId,
        latestActiveAttempt: null,
        mostRecentAttempt: expect.objectContaining({
          requestId: fixture.policy.requestId,
          lifecycle: "running",
          quoteEligibility: "none",
        }),
      }),
    ]);
    expect((await repository.resolveMarket(marketId, repositoryTestNowSec))?.market)
      .toMatchObject({
        requestAttemptCount: 1,
        quoteBearingAttemptCount: 0,
        latestActiveAttempt: null,
        mostRecentAttempt: {
          requestId: fixture.policy.requestId,
          lifecycle: "running",
          quoteEligibility: "none",
        },
      });
  });
});
