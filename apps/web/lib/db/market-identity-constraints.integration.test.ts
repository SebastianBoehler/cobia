import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { USDT_ADDRESS } from "../chain/supported-assets";
import { startIntegrationDatabase } from "./integration-database";
import { createRepositoryFixture } from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { cobiaMarkets, cobiaRequests } from "./schema";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;

let database: IntegrationDatabase | undefined;

async function expectConstraint(promise: Promise<unknown>, name: string) {
  try {
    await promise;
    throw new Error(`Expected constraint ${name} to reject the mutation`);
  } catch (error) {
    expect((error as Error).cause).toMatchObject({ constraint_name: name });
  }
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

describe("market identity database constraints", () => {
  it("rejects a non-mainnet market identity", async () => {
    if (!database) throw new Error("Integration database did not start");
    const asset = USDT_ADDRESS.toLowerCase();

    await expectConstraint(database.db.insert(cobiaMarkets).values({
      id: `1952:${asset}`,
      executionChainId: 1952,
      asset,
    }), "cobia_markets_identity_check");
  });

  it("rejects noncanonical asset casing and mismatched IDs", async () => {
    if (!database) throw new Error("Integration database did not start");
    const asset = USDT_ADDRESS.toLowerCase();

    await expectConstraint(database.db.insert(cobiaMarkets).values({
      id: `196:${asset}`,
      executionChainId: 196,
      asset: USDT_ADDRESS,
    }), "cobia_markets_identity_check");
    await expectConstraint(database.db.insert(cobiaMarkets).values({
      id: `196:0x${"1".repeat(40)}`,
      executionChainId: 196,
      asset,
    }), "cobia_markets_identity_check");
  });

  it("rejects moving a request to a market inconsistent with its signed policy", async () => {
    if (!database) throw new Error("Integration database did not start");
    const fixture = await createRepositoryFixture();
    await createRequestRepository(database.db).createRequest(fixture.policy);
    const otherAsset = USDT_ADDRESS.toLowerCase();
    const otherMarketId = `196:${otherAsset}`;
    await database.db.insert(cobiaMarkets).values({
      id: otherMarketId,
      executionChainId: 196,
      asset: otherAsset,
    });

    await expectConstraint(database.db.update(cobiaRequests)
      .set({ marketId: otherMarketId })
      .where(eq(cobiaRequests.id, fixture.policy.requestId)),
    "cobia_requests_market_identity_check");

    await expectConstraint(database.db.execute(sql`
      UPDATE cobia_requests
      SET policy = policy - 'asset'
      WHERE id = ${fixture.policy.requestId}::uuid
    `), "cobia_requests_market_identity_check");
  });
});
