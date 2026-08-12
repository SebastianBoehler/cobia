import { projectRouteQuote, verifyBundle } from "@cobia/domain";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { USDT_ADDRESS } from "../chain/supported-assets";
import { startIntegrationDatabase } from "./integration-database";
import { createMarketRepository } from "./markets";
import {
  createRepositoryFixture,
  repositoryTestNowSec,
} from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { cobiaMarkets, cobiaQuotes, cobiaRequests } from "./schema";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;

let database: IntegrationDatabase | undefined;

async function persistFixture(
  kind: "eligible" | "expired" | "rejected",
  asset?: `0x${string}`,
) {
  if (!database) throw new Error("Integration database did not start");
  const fixture = await createRepositoryFixture(asset ? { asset } : undefined);
  const requests = createRequestRepository(database.db);
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  if (kind === "rejected") {
    const bundle = {
      ...fixture.bundle,
      expectedNetApyBps: fixture.bundle.expectedNetApyBps + 1,
    };
    const verdict = await verifyBundle(
      fixture.policy,
      fixture.snapshot,
      bundle,
      fixture.bundle.solverAddress,
      repositoryTestNowSec,
    );
    const quote = projectRouteQuote(bundle, verdict, "100000", repositoryTestNowSec + 240);
    await requests.saveQuote(fixture.policy.requestId, bundle, verdict, quote);
    await requests.markQuotesReady(fixture.policy.requestId);
    return { ...fixture, quote };
  }
  const quote = kind === "expired"
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

describe("market persistence boundary", () => {
  it("groups same-asset attempts while keeping distinct assets separate", async () => {
    if (!database) throw new Error("Integration database did not start");
    const first = await persistFixture("eligible");
    const second = await persistFixture("eligible");
    const usdt = await persistFixture("eligible", USDT_ADDRESS);

    const summaries = await createMarketRepository(database.db).listMarkets(repositoryTestNowSec);
    const usdgId = `196:${first.policy.asset.toLowerCase()}`;
    expect(summaries.map(({ id }) => id).sort()).toEqual([
      usdgId,
      `196:${usdt.policy.asset.toLowerCase()}`,
    ].sort());
    expect(summaries.find(({ id }) => id === usdgId)).toMatchObject({
      requestAttemptCount: 2,
      quoteBearingAttemptCount: 2,
      latestActiveAttempt: { requestId: second.policy.requestId },
    });
  });

  it("resolves canonical IDs and legacy attempt IDs but rejects malformed input", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await persistFixture("eligible");
    const repository = createMarketRepository(database.db);
    const canonicalId = `196:${fixture.policy.asset.toLowerCase()}`;

    expect(await repository.resolveMarket(canonicalId, repositoryTestNowSec)).toMatchObject({
      canonicalId,
      resolvedFrom: "market",
    });
    expect(await repository.resolveMarket(fixture.policy.requestId, repositoryTestNowSec))
      .toMatchObject({ canonicalId, resolvedFrom: "attempt" });
    expect(await repository.resolveMarket("196:not-an-address", repositoryTestNowSec))
      .toBeUndefined();
  });

  it("lists every market while keeping only unexpired quotes live", async () => {
    if (!database) throw new Error("Integration database did not start");
    const eligible = await persistFixture("eligible");
    const expired = await persistFixture("expired", USDT_ADDRESS);
    const rejected = await persistFixture("rejected", "0x3333333333333333333333333333333333333333");
    const repository = createRequestRepository(database.db);

    const markets = await createMarketRepository(database.db).listMarkets(repositoryTestNowSec);
    expect(markets.map(({ id }) => id).sort()).toEqual([
      `196:${eligible.policy.asset.toLowerCase()}`,
      `196:${expired.policy.asset.toLowerCase()}`,
      `196:${rejected.policy.asset.toLowerCase()}`,
    ].sort());
    expect(markets.find(({ id }) => id.endsWith(eligible.policy.asset.toLowerCase())))
      .toMatchObject({ latestActiveAttempt: { requestId: eligible.policy.requestId } });
    expect(markets.find(({ id }) => id.endsWith(expired.policy.asset.toLowerCase())))
      .toMatchObject({
        latestActiveAttempt: null,
        mostRecentAttempt: {
          quoteEligibility: "inactive",
          quotes: [{ quoteId: expired.quote.quoteId }],
        },
      });
    expect(markets.find(({ id }) => id.endsWith(rejected.policy.asset.toLowerCase())))
      .toMatchObject({
        latestActiveAttempt: null,
        mostRecentAttempt: { quoteEligibility: "none", quotes: [] },
      });
    expect((await repository.getPublicRequest(expired.policy.requestId, repositoryTestNowSec))
      ?.quotes).toEqual([]);
    expect((await repository.getPublicRequest(rejected.policy.requestId, repositoryTestNowSec))
      ?.quotes).toEqual([]);
    expect((await database.db.query.cobiaQuotes.findMany({
      columns: { id: true },
      where: inArray(cobiaQuotes.id, [
        eligible.quote.quoteId,
        expired.quote.quoteId,
        rejected.quote.quoteId,
      ]),
    }))).toHaveLength(3);
  });

  it("retains the selected expired quote and route identity in public history", async () => {
    if (!database) throw new Error("Integration database did not start");
    const selected = await persistFixture("eligible");
    await database.db.update(cobiaRequests).set({
      selectedQuoteId: selected.quote.quoteId,
      state: "revealed",
    }).where(eq(cobiaRequests.id, selected.policy.requestId));
    const expiredAt = selected.quote.validUntil;
    const requests = createRequestRepository(database.db);

    expect(await requests.getPublicRequest(selected.policy.requestId, expiredAt)).toMatchObject({
      selectedQuoteId: selected.quote.quoteId,
      purchasedRouteId: selected.quote.quoteId,
      quotes: [{ quoteId: selected.quote.quoteId }],
    });
    expect(await createMarketRepository(database.db)
      .getMarket(selected.policy.requestId, expiredAt)).toMatchObject({
        latestActiveAttempt: null,
        mostRecentAttempt: {
          requestId: selected.policy.requestId,
          lifecycle: "completed",
          quoteEligibility: "inactive",
          quotes: [{ quoteId: selected.quote.quoteId }],
        },
      });
  });
});
