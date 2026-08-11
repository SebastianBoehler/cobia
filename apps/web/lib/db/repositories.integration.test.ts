import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createActivityRepository } from "./activity";
import { startIntegrationDatabase } from "./integration-database";
import { createPurchaseRepository } from "./purchases";
import {
  createRepositoryFixture,
  createRepositoryFixtureV2,
  freshReceiptHash,
  repositoryTestAccount,
  repositoryTestNowSec,
} from "./repository-test-fixtures";
import { createMarketRepository } from "./markets";
import { createRequestRepository } from "./requests";
import {
  cobiaActivityEvents,
  cobiaQuotes,
  cobiaRequests,
  cobiaRoutePurchases,
} from "./schema";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;
type RequestRepository = ReturnType<typeof createRequestRepository>;

let database: IntegrationDatabase | undefined;
let requests: RequestRepository | undefined;

function requestRepository(): RequestRepository {
  if (!requests) throw new Error("Integration database did not start");
  return requests;
}

async function persistQuote() {
  const fixture = await createRepositoryFixture();
  const repository = requestRepository();
  await repository.createRequest(fixture.policy);
  await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  await repository.saveQuote(
    fixture.policy.requestId,
    fixture.bundle,
    fixture.verdict,
    fixture.quote,
  );
  await repository.markQuotesReady(fixture.policy.requestId);
  return fixture;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  requests = createRequestRepository(database.db);
});

afterAll(async () => {
  await database?.close();
});

describe("PostgreSQL repositories", () => {
  it("persists private bundles but returns only sanitized public quotes", async () => {
    const fixture = await persistQuote();

    const result = await requestRepository().getPublicRequest(
      fixture.policy.requestId,
      repositoryTestNowSec,
    );
    expect(result?.state).toBe("quotes_ready");
    expect(result?.quotes).toEqual([fixture.quote]);
    expect(JSON.stringify(result)).not.toContain(fixture.bundle.action.kind);
    expect(JSON.stringify(result)).not.toContain("amountAtomic");
  });

  it("rejects selection of a quote outside the request", async () => {
    const fixture = await persistQuote();

    await expect(
      requestRepository().selectQuote(
        fixture.policy.requestId,
        `0x${"ff".repeat(32)}`,
        repositoryTestNowSec,
      ),
    ).rejects.toThrow("eligible quote");
  });

  it("reads an exact purchased route for its normalized buyer", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await persistQuote();
    const purchasedAt = new Date("2026-08-10T10:05:06.789Z");
    const receiptHash = freshReceiptHash();
    const purchase = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: fixture.policy.owner,
      executionChainId: fixture.policy.executionChainId,
      paymentChainId: 1952,
      receiptHash,
      bundle: fixture.bundle,
      purchasedAt,
    } as const;
    const purchases = createPurchaseRepository(database.db);
    await database.db.insert(cobiaRoutePurchases).values({
      ...purchase,
      buyer: purchase.buyer.toLowerCase(),
    });
    await database.db.update(cobiaRequests).set({
      state: "paid", selectedQuoteId: purchase.quoteId,
    }).where(eq(cobiaRequests.id, purchase.requestId));

    expect(await purchases.getPurchasedRoute(purchase.id, purchase.buyer)).toStrictEqual({
      ...purchase,
      buyer: purchase.buyer.toLowerCase(),
      paymentId: null,
    });
    expect(
      await purchases.getPurchasedRoute(purchase.id, purchase.buyer.toUpperCase()),
    ).toBeDefined();
    expect((await requestRepository().getPublicRequest(purchase.requestId))?.purchasedRouteId)
      .toBe(purchase.id);
  });

  it("returns wallet activity newest first", async () => {
    if (!database) throw new Error("Integration database did not start");
    const activity = createActivityRepository(database.db);
    const older = { id: crypto.randomUUID(), occurredAt: new Date("2026-08-10T10:00:00Z") };
    const newer = { id: crypto.randomUUID(), occurredAt: new Date("2026-08-10T11:00:00Z") };
    await database.db.insert(cobiaActivityEvents).values([older, newer].map((event) => ({
        ...event,
        wallet: repositoryTestAccount.address.toLowerCase(),
        executionChainId: 196,
        kind: "route_revealed",
        status: "confirmed",
        detail: {},
      })));

    expect(
      (await activity.listActivity(repositoryTestAccount.address, 196)).map(({ id }) => id),
    ).toEqual([newer.id, older.id]);
  });

  it("persists and publicly projects an authorized V2 route round", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await createRepositoryFixtureV2();
    const repository = requestRepository();
    await repository.createRequest(fixture.policy);
    await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
    await repository.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      fixture.verdict,
      fixture.quote,
    );
    await repository.markQuotesReady(fixture.policy.requestId);

    const publicRequest = await repository.getPublicRequest(
      fixture.policy.requestId,
      repositoryTestNowSec,
    );
    expect(publicRequest).toMatchObject({
      policy: { version: 2, requestId: fixture.policy.requestId },
      snapshot: { version: 2, blockNumber: "1001" },
      quotes: [{
        version: 2,
        quoteId: fixture.quote.quoteId,
        estimatedPreGasApyBps: fixture.quote.estimatedPreGasApyBps,
        authorization: { routeAuthorized: true, errorCodes: [] },
      }],
    });
    expect(JSON.stringify(publicRequest)).not.toContain("routePlan");

    const market = await createMarketRepository(database.db).getMarket(
      `196:${fixture.policy.asset}`,
      repositoryTestNowSec,
    );
    expect(market?.latestActiveAttempt).toMatchObject({
      policy: { version: 2 },
      protocols: ["Aave V3", "Uniswap V3"],
      sourceApyBps: 39,
      quotes: [{ quoteId: fixture.quote.quoteId }],
    });
    expect(await database.db.query.cobiaQuotes.findFirst({
      columns: { executable: true },
      where: eq(cobiaQuotes.id, fixture.quote.quoteId),
    })).toEqual({ executable: true });
  });

  it("rejects mixed V1/V2 artifacts before writing a round", async () => {
    const route = await createRepositoryFixtureV2();
    const legacy = await createRepositoryFixture();
    const repository = requestRepository();
    await repository.createRequest(route.policy);
    await expect(repository.saveSnapshot(route.policy.requestId, {
      ...legacy.snapshot,
      requestId: route.policy.requestId,
    })).rejects.toThrow(/version/i);
    await repository.saveSnapshot(route.policy.requestId, route.snapshot);
    await expect(repository.saveQuote(
      route.policy.requestId,
      { ...legacy.bundle, requestId: route.policy.requestId },
      legacy.verdict,
      { ...legacy.quote, requestId: route.policy.requestId },
    )).rejects.toThrow(/version/i);
  });

  it("rejects a fabricated V2 verdict at the live write boundary", async () => {
    const fixture = await createRepositoryFixtureV2();
    const repository = requestRepository();
    await repository.createRequest(fixture.policy);
    await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);

    await expect(repository.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      { ...fixture.verdict, errorCodes: [...fixture.verdict.errorCodes] },
      fixture.quote,
    )).rejects.toThrow("not produced by verifyRouteBundleV2");
  });

  it("rejects a V2 public APY that differs from the verified projection", async () => {
    const fixture = await createRepositoryFixtureV2();
    const repository = requestRepository();
    await repository.createRequest(fixture.policy);
    await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);

    await expect(repository.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      fixture.verdict,
      {
        ...fixture.quote,
        estimatedPreGasApyBps: fixture.quote.estimatedPreGasApyBps + 1,
      },
    )).rejects.toThrow(/projection/i);
  });

  it.each([
    ["policy", (fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>) => ({
      ...fixture,
      bundle: { ...fixture.bundle, policyHash: `0x${"de".repeat(32)}` as const },
    })],
    ["snapshot", (fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>) => ({
      ...fixture,
      bundle: { ...fixture.bundle, snapshotHash: `0x${"de".repeat(32)}` as const },
    })],
    ["verdict", (fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>) => ({
      ...fixture,
      verdict: { ...fixture.verdict, bundleHash: `0x${"de".repeat(32)}` as const },
    })],
    ["quote", (fixture: Awaited<ReturnType<typeof createRepositoryFixtureV2>>) => ({
      ...fixture,
      quote: { ...fixture.quote, bundleHash: `0x${"de".repeat(32)}` as const },
    })],
  ] as const)("rejects a V2 %s hash mismatch", async (_, mutate) => {
    const fixture = mutate(await createRepositoryFixtureV2());
    const repository = requestRepository();
    await repository.createRequest(fixture.policy);
    await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);

    await expect(repository.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      fixture.verdict,
      fixture.quote,
    )).rejects.toThrow(/commitment/i);
  });
});
