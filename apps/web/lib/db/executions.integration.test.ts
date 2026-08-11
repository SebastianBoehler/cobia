import { commitment } from "@cobia/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registryHash } from "../adapters/registry";
import { startIntegrationDatabase } from "./integration-database";
import { createExecutionRepository } from "./executions";
import { createRehearsalRepository } from "./rehearsals";
import {
  createRepositoryFixtureV2,
  freshReceiptHash,
} from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";
import { cobiaActivityEvents, cobiaRequests, cobiaRoutePurchases } from "./schema";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
type Fixture = Awaited<ReturnType<typeof createRepositoryFixtureV2>>;

let database: Database | undefined;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

async function passedRoute(nonceByte: string) {
  const fixture = await createRepositoryFixtureV2();
  const requests = createRequestRepository(db());
  await requests.createRequest(fixture.policy);
  await requests.saveSnapshot(fixture.policy.requestId, fixture.snapshot);
  await requests.saveQuote(
    fixture.policy.requestId,
    fixture.bundle,
    fixture.verdict,
    fixture.quote,
  );
  await requests.markQuotesReady(fixture.policy.requestId);
  await db().insert(cobiaRoutePurchases).values({
    id: fixture.quote.quoteId,
    requestId: fixture.policy.requestId,
    quoteId: fixture.quote.quoteId,
    buyer: fixture.policy.owner.toLowerCase(),
    executionChainId: 196,
    paymentChainId: 1952,
    receiptHash: freshReceiptHash(),
    bundle: fixture.bundle,
  });
  await db().update(cobiaRequests).set({
    state: "revealed",
    selectedQuoteId: fixture.quote.quoteId,
  }).where(eq(cobiaRequests.id, fixture.policy.requestId));

  const proof = {
    version: 1 as const,
    domain: "cobia.execution.rehearsal.v1" as const,
    realm: "localhost:3000",
    routeId: fixture.quote.quoteId,
    bundleHash: commitment(fixture.bundle),
    buyer: fixture.policy.owner.toLowerCase() as `0x${string}`,
    executionChainId: 196 as const,
    nonce: `0x${nonceByte.repeat(64)}` as `0x${string}`,
    expiresAt: 2_000_000_240,
  };
  const rehearsals = createRehearsalRepository(db());
  const rehearsal = await rehearsals.begin({
    proof,
    proofHash: commitment(proof),
    nowSec: 2_000_000_000,
  });
  const trace = { status: "success", routeId: fixture.quote.quoteId, transactions: [] };
  const passed = await rehearsals.complete(rehearsal.id, {
    registryHash,
    snapshotBlockHash: fixture.snapshot.blockHash,
    engineVersion: "execution-v2@1",
    traceHash: commitment(trace),
    trace,
  });
  return { fixture, rehearsal: passed };
}

function beginInput(route: { fixture: Fixture; rehearsal: { id: string; traceHash: string | null } }) {
  return {
    routeId: route.fixture.quote.quoteId,
    bundleHash: commitment(route.fixture.bundle),
    buyer: route.fixture.policy.owner,
    executionChainId: 196 as const,
    rehearsalId: route.rehearsal.id,
    rehearsalTraceHash: route.rehearsal.traceHash as `0x${string}`,
    proofHash: `0x${"a1".repeat(32)}` as const,
    proofNonce: `0x${"b2".repeat(32)}` as const,
    proofExpiresAt: new Date("2033-05-18T03:37:20.000Z"),
    nowSec: 2_000_000_000,
  };
}

function preparedInput(attemptId: string, ordinal = 0) {
  const data = `0x095ea7b3${"00".repeat(64)}` as `0x${string}`;
  return {
    attemptId,
    ordinal,
    kind: "approval" as const,
    from: "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const,
    to: "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const,
    valueAtomic: "0",
    data,
    calldataHash: commitment(data),
    semantic: { asset: "USDt0", amountAtomic: "10000000" },
    preBlockNumber: "67649362",
    preBlockHash: `0x${"cc".repeat(32)}` as const,
    expectedNonce: "7",
    gasEstimateAtomic: "45123",
  };
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
});

afterAll(async () => {
  await database?.close();
});

describe("guided mainnet execution repository", () => {
  it("creates one exact attempt and rejects changed retry authority", async () => {
    const route = await passedRoute("1");
    const executions = createExecutionRepository(db());
    const input = beginInput(route);
    const first = await executions.begin(input);

    expect(await executions.begin(input)).toEqual(first);
    expect(first).toMatchObject({ state: "prepared", executionChainId: 196, nextOrdinal: 0 });
    await expect(executions.begin({
      ...input,
      buyer: "0x0000000000000000000000000000000000000001",
    })).rejects.toThrow("conflicts");
  });

  it("persists an ordered step and rejects changed calldata or skipped ordinals", async () => {
    const route = await passedRoute("2");
    const executions = createExecutionRepository(db());
    const attempt = await executions.begin({
      ...beginInput(route),
      proofHash: `0x${"a2".repeat(32)}`,
      proofNonce: `0x${"b3".repeat(32)}`,
    });
    const input = preparedInput(attempt.id);
    const first = await executions.prepareStep(input);

    expect(await executions.prepareStep(input)).toEqual(first);
    await expect(executions.prepareStep({ ...input, ordinal: 1 }))
      .rejects.toThrow("unresolved");
    const changedData = `0x095ea7b3${"11".repeat(64)}` as const;
    await expect(executions.prepareStep({
      ...input,
      data: changedData,
      calldataHash: commitment(changedData),
    })).rejects.toThrow("conflicts");
  });

  it("serializes submitted, confirmed, next-step, and complete transitions", async () => {
    const route = await passedRoute("3");
    const executions = createExecutionRepository(db());
    const attempt = await executions.begin({
      ...beginInput(route),
      proofHash: `0x${"a3".repeat(32)}`,
      proofNonce: `0x${"b4".repeat(32)}`,
    });
    await executions.prepareStep(preparedInput(attempt.id));
    const transactionHash = `0x${"ee".repeat(32)}` as const;
    await executions.bindSubmittedHash(attempt.id, 0, transactionHash);

    await expect(executions.prepareStep(preparedInput(attempt.id, 1)))
      .rejects.toThrow("unresolved");
    const confirmed = await executions.confirmStep(attempt.id, 0, {
      transactionHash,
      receipt: { blockNumber: "67649363", blockHash: `0x${"f1".repeat(32)}` },
      evidence: { protocolEvent: "Approval" },
      postcondition: { allowanceAtomic: "10000000" },
      complete: false,
    });
    expect(confirmed.attempt).toMatchObject({ state: "partial", nextOrdinal: 1 });

    const next = { ...preparedInput(attempt.id, 1), kind: "supply" as const };
    await executions.prepareStep(next);
    const secondHash = `0x${"ef".repeat(32)}` as const;
    await executions.bindSubmittedHash(attempt.id, 1, secondHash);
    const complete = await executions.confirmStep(attempt.id, 1, {
      transactionHash: secondHash,
      receipt: { blockNumber: "67649364", blockHash: `0x${"f2".repeat(32)}` },
      evidence: { protocolEvent: "Supply" },
      postcondition: { aTokenDeltaAtomic: "10000000" },
      complete: true,
    });
    expect(complete.attempt.state).toBe("complete");
    expect((await executions.getAttempt(attempt.id))?.steps).toHaveLength(2);
  });

  it("makes a broadcast ambiguity durable and never prepares another step", async () => {
    const route = await passedRoute("4");
    const executions = createExecutionRepository(db());
    const attempt = await executions.begin({
      ...beginInput(route),
      proofHash: `0x${"a4".repeat(32)}`,
      proofNonce: `0x${"b5".repeat(32)}`,
    });
    await executions.prepareStep(preparedInput(attempt.id));
    const transactionHash = `0x${"e1".repeat(32)}` as const;
    await executions.bindSubmittedHash(attempt.id, 0, transactionHash);
    const reconciled = await executions.markReconcile(attempt.id, 0, "RECEIPT_UNRESOLVED");

    expect(reconciled.attempt.state).toBe("reconcile");
    await expect(executions.prepareStep(preparedInput(attempt.id, 1)))
      .rejects.toThrow("reconciliation");
    expect(await executions.findRecoverable(route.fixture.policy.owner))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: attempt.id })]));
  });

  it("keeps step and activity changes atomic", async () => {
    const route = await passedRoute("5");
    const executions = createExecutionRepository(db());
    const attempt = await executions.begin({
      ...beginInput(route),
      proofHash: `0x${"a5".repeat(32)}`,
      proofNonce: `0x${"b6".repeat(32)}`,
    });
    await executions.prepareStep(preparedInput(attempt.id));
    await executions.failStep(attempt.id, 0, "WALLET_REJECTED");

    const activities = await db().select().from(cobiaActivityEvents)
      .where(eq(cobiaActivityEvents.routeId, route.fixture.quote.quoteId));
    expect(activities.map((event) => event.kind)).toEqual([
      "execution_started",
      "execution_step_prepared",
      "execution_failed",
    ]);
  });
});
