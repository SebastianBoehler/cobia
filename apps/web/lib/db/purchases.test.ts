import {
  commitment,
  projectRouteQuote,
  verifyBundle,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "@cobia/domain";
import { createDeterministicSolver } from "@cobia/solvers";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import { createActivityRepository } from "./activity";
import { createDatabase } from "./client";
import { createPurchaseRepository } from "./purchases";
import { cobiaActivityEvents, cobiaRequests, cobiaRoutePurchases } from "./schema";

const database = process.env.TEST_DATABASE_URL
  ? createDatabase(process.env.TEST_DATABASE_URL)
  : undefined;
const purchases = database ? createPurchaseRepository(database.db) : undefined;
const activity = database ? createActivityRepository(database.db) : undefined;
const account = privateKeyToAccount(keccak256(toHex("cobia-purchase-test-signer")));

async function purchaseFixture() {
  const requestId = crypto.randomUUID();
  const policy: StablecoinPolicy = {
    version: 1,
    requestId,
    owner: account.address,
    executionChainId: 196,
    asset: USDG_ADDRESS,
    principalAtomic: "25000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "1000000",
    minNetApyBps: 0,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
  };
  const snapshot: MarketSnapshot = {
    version: 1,
    requestId,
    chainId: 196,
    blockNumber: "1000",
    blockHash: `0x${"ab".repeat(32)}`,
    capturedAt: "2026-08-10T10:00:00.000Z",
    asset: { address: USDG_ADDRESS, symbol: "USDG", decimals: 6 },
    candidates: [{
      id: "cash:usdg",
      kind: "cash",
      apyBps: 0,
      tvlUsdE6: "0",
      retrievedAt: "2026-08-10T10:00:00.000Z",
    }],
  };
  const solver = createDeterministicSolver({ solverId: "no-action", account });
  const bundle = await solver.solve({ policy, snapshot, nowSec: 1_800_000_000 });
  const verdict = await verifyBundle(policy, snapshot, bundle, solver.address, 1_800_000_000);
  const quote = projectRouteQuote(bundle, verdict, "100000", 1_800_000_240);
  return {
    id: quote.quoteId,
    requestId,
    quoteId: quote.quoteId,
    buyer: account.address,
    chainId: 196,
    receiptHash: `0x${"cd".repeat(32)}`,
    bundle,
    policy,
  } as const;
}

beforeAll(async () => {
  if (!database) return;
  await database.db.delete(cobiaActivityEvents);
  await database.db.delete(cobiaRoutePurchases);
});

afterAll(async () => database?.close());

const describeWithDatabase = database ? describe : describe.skip;

describeWithDatabase("purchase and activity repositories", () => {
  it("recovers a purchased route for its buyer", async () => {
    if (!purchases) throw new Error("Database unavailable");
    const fixture = await purchaseFixture();
    await database?.db.insert(cobiaRequests).values({
      id: fixture.requestId,
      policy: fixture.policy,
      policyHash: commitment(fixture.policy),
    });
    await purchases.recordRoutePurchase(fixture);
    expect(await purchases.getPurchasedRoute(fixture.id, fixture.buyer)).toMatchObject({
      id: fixture.id,
      requestId: fixture.requestId,
      quoteId: fixture.quoteId,
      buyer: fixture.buyer.toLowerCase(),
      chainId: 196,
      receiptHash: fixture.receiptHash,
      bundle: fixture.bundle,
    });
    expect(await purchases.getPurchasedRoute(fixture.id, account.address.toUpperCase())).toBeDefined();
  });

  it("returns wallet activity newest first", async () => {
    if (!activity) throw new Error("Database unavailable");
    const older = { id: crypto.randomUUID(), occurredAt: new Date("2026-08-10T10:00:00Z") };
    const newer = { id: crypto.randomUUID(), occurredAt: new Date("2026-08-10T11:00:00Z") };
    for (const event of [older, newer]) {
      await activity.appendActivity({
        ...event,
        wallet: account.address,
        chainId: 196,
        kind: "route_revealed",
        status: "confirmed",
        detail: {},
      });
    }
    expect((await activity.listActivity(account.address, 196)).map(({ id }) => id))
      .toEqual([newer.id, older.id]);
  });
});
