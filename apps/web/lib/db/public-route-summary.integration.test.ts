import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createRepositoryFixtureV2, repositoryTestNowSec } from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";

type IntegrationDatabase = Awaited<ReturnType<typeof startIntegrationDatabase>>;

let database: IntegrationDatabase | undefined;

beforeAll(async () => {
  database = await startIntegrationDatabase();
});

afterAll(async () => {
  await database?.close();
});

describe("public route summary projection", () => {
  it("returns the sanitized path for a visible V2 quote", async () => {
    if (!database) throw new Error("Integration database did not start");
    const repository = createRequestRepository(database.db);
    const fixture = await createRepositoryFixtureV2({
      principalAtomic: "10000000",
      protocolExposureBps: 10_000,
    });
    await repository.createRequest(fixture.policy);
    await repository.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
    await repository.saveQuote(
      fixture.policy.requestId,
      fixture.bundle,
      fixture.verdict,
      fixture.quote,
    );
    await repository.markQuotesReady(fixture.policy.requestId);

    const result = await repository.getPublicRequest(
      fixture.policy.requestId,
      repositoryTestNowSec,
    );

    expect(result?.routeSummaries[fixture.quote.quoteId]).toMatchObject({
      version: 2,
      inputAtomic: "10000000",
      retainedAtomic: "0",
      steps: [
        { kind: "swap", protocol: "Uniswap V3" },
        { kind: "supply", protocol: "Aave V3" },
      ],
    });
    expect(JSON.stringify(result?.routeSummaries)).not.toMatch(
      /opportunityId|signature|evidence|riskFlags|routePlan/,
    );
  });
});
