import {
  projectRouteQuote,
  verifyBundle,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "@cobia/domain";
import { createDeterministicSolver } from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import { createDatabase } from "./client";
import { createRequestRepository } from "./requests";
import { cobiaQuotes, cobiaRequests } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : undefined;
const repository = database ? createRequestRepository(database.db) : undefined;
const solverAccount = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const nowSec = Date.parse("2026-08-09T10:01:00.000Z") / 1_000;

function fixtures() {
  const requestId = crypto.randomUUID();
  const policy: StablecoinPolicy = {
    version: 1,
    requestId,
    owner: solverAccount.address,
    executionChainId: 196,
    asset: USDG_ADDRESS,
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 200,
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
    capturedAt: "2026-08-09T10:00:00.000Z",
    asset: { address: USDG_ADDRESS, symbol: "USDG", decimals: 6 },
    candidates: [
      { id: "cash:usdg", kind: "cash", apyBps: 0, tvlUsdE6: "0", retrievedAt: "2026-08-09T10:00:00.000Z" },
      {
        id: "aave-v3:9001",
        kind: "aave-v3",
        investmentId: "9001",
        poolAddress: "0x2222222222222222222222222222222222222222",
        apyBps: 642,
        tvlUsdE6: "500000000000",
        utilizationBps: 7_200,
        retrievedAt: "2026-08-09T10:00:00.000Z",
      },
    ],
  };
  return { policy, snapshot };
}

async function persistedQuote() {
  const { policy, snapshot } = fixtures();
  const solver = createDeterministicSolver({ solverId: "determinist", account: solverAccount });
  const bundle = await solver.solve({ policy, snapshot, nowSec });
  const verdict = await verifyBundle(policy, snapshot, bundle, solver.address, nowSec);
  const quote = projectRouteQuote(bundle, verdict, "100000", nowSec + 240);
  if (!repository) throw new Error("DATABASE_URL is required for repository tests");
  await repository.createRequest(policy);
  await repository.saveSnapshot(policy.requestId, snapshot);
  await repository.saveQuote(policy.requestId, bundle, verdict, quote);
  await repository.markQuotesReady(policy.requestId);
  return { policy, bundle, quote };
}

beforeAll(async () => {
  if (!database) return;
  await database.db.delete(cobiaQuotes);
  await database.db.delete(cobiaRequests);
});

afterAll(async () => database?.close());

const describeWithDatabase = database ? describe : describe.skip;

describeWithDatabase("request repository", () => {
  it("persists private bundles but returns only sanitized public quotes", async () => {
    if (!repository) throw new Error("Database unavailable");
    const { policy, bundle, quote } = await persistedQuote();

    const result = await repository.getPublicRequest(policy.requestId);
    expect(result?.state).toBe("quotes_ready");
    expect(result?.quotes).toEqual([quote]);
    expect(JSON.stringify(result)).not.toContain(bundle.action.kind);
    expect(JSON.stringify(result)).not.toContain("amountAtomic");
  });

  it("rejects selection of a quote outside the request", async () => {
    if (!repository) throw new Error("Database unavailable");
    const { policy } = await persistedQuote();

    await expect(
      repository.selectQuote(policy.requestId, `0x${"ff".repeat(32)}`, nowSec),
    ).rejects.toThrow("executable quote");
  });

  it("enforces selection, payment, and reveal order with receipt replay protection", async () => {
    if (!repository) throw new Error("Database unavailable");
    const first = await persistedQuote();
    const second = await persistedQuote();
    await repository.selectQuote(first.policy.requestId, first.quote.quoteId, nowSec);
    await repository.selectQuote(second.policy.requestId, second.quote.quoteId, nowSec);

    await expect(
      repository.getPaidBundle(first.policy.requestId, first.quote.quoteId),
    ).rejects.toThrow("paid selected quote");
    await expect(repository.markRevealed(first.policy.requestId)).rejects.toThrow("paid request");
    await repository.recordPayment(first.policy.requestId, `0x${"cd".repeat(32)}`);
    await expect(
      repository.recordPayment(second.policy.requestId, `0x${"cd".repeat(32)}`),
    ).rejects.toThrow();
    expect(await repository.getPaidBundle(first.policy.requestId, first.quote.quoteId)).toEqual(
      first.bundle,
    );
    await repository.markRevealed(first.policy.requestId);
    expect((await repository.getPublicRequest(first.policy.requestId))?.state).toBe("revealed");
  });
});
