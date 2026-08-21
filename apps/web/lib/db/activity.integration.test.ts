import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivityRepository } from "./activity";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createOpenIntentTestPolicy } from "./open-intent-test-fixture";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverSubmissionRepository } from "./solver-submissions";
import { cobiaActivityEvents } from "./schema";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;

const owner = "0x9afbf85e52612a9922617adda9569e13f565de31";
const nowSec = Math.floor(Date.now() / 1_000);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
let database: Database | undefined;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createSolverProfileRepository(db()).register({
    id: "activity-solver",
    displayName: "Activity Solver",
    operatorKind: "internal",
    attestationAddress: null,
    declaredCapabilities: ["evm.raw@1"],
  });
});

afterAll(async () => { await database?.close(); });

describe("wallet activity projection", () => {
  it("combines created and expired intents, executed programs, and legacy events", async () => {
    const intents = createIntentRepository(db());
    const expired = createOpenIntentTestPolicy({
      requestId: crypto.randomUUID(), owner, nowSec: nowSec - 600,
    });
    const executed = createOpenIntentTestPolicy({
      requestId: crypto.randomUUID(), owner, nowSec,
    });
    await intents.create({ policy: expired, ownerSignature: `0x${"44".repeat(65)}` });
    await intents.create({ policy: executed, ownerSignature: `0x${"55".repeat(65)}` });

    const submissions = createSolverSubmissionRepository(db());
    const expiredSubmission = await submissions.append({
      intentId: expired.requestId,
      solverId: "activity-solver",
      revision: 1,
      programHash: hash("4"),
      validUntilSec: nowSec - 400,
      blockNumber: "68572000",
      blockHash: hash("5"),
      observedAtSec: nowSec - 600,
    });
    await submissions.resolve(expiredSubmission.id, "verified", []);
    await submissions.resolve(expiredSubmission.id, "attested", []);
    const submission = await submissions.append({
      intentId: executed.requestId,
      solverId: "activity-solver",
      revision: 1,
      programHash: hash("6"),
      validUntilSec: nowSec + 120,
      blockNumber: "68572243",
      blockHash: hash("7"),
      observedAtSec: nowSec,
    });
    await submissions.resolve(submission.id, "verified", []);
    await submissions.resolve(submission.id, "attested", []);
    const transactionHash = hash("8");
    await submissions.appendArtifact(submission.id, "receipt", {
      version: 3,
      transactionHash,
      blockNumber: "68572243",
    });
    await submissions.resolve(submission.id, "executed", []);

    const legacyId = crypto.randomUUID();
    await db().insert(cobiaActivityEvents).values({
      id: legacyId,
      wallet: owner,
      executionChainId: 196,
      kind: "route_revealed",
      status: "confirmed",
      detail: {},
      occurredAt: new Date((nowSec - 120) * 1_000),
    });

    const events = await createActivityRepository(db()).listActivity(
      owner,
      196,
      new Date((nowSec + 1) * 1_000),
    );

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `${expired.requestId}:created`,
        kind: "intent_created",
        detail: { intentId: expired.requestId },
      }),
      expect.objectContaining({
        id: `${expired.requestId}:closed`,
        kind: "intent_closed",
        status: "closed",
        detail: { intentId: expired.requestId },
      }),
      expect.objectContaining({
        id: `${expiredSubmission.id}:expired`,
        kind: "program_expired",
        status: "expired",
        detail: { intentId: expired.requestId, submissionId: expiredSubmission.id },
      }),
      expect.objectContaining({
        id: `${submission.id}:executed`,
        kind: "program_executed",
        transactionHash,
        detail: { intentId: executed.requestId, submissionId: submission.id },
      }),
      expect.objectContaining({ id: legacyId, kind: "route_revealed" }),
    ]));
    expect(events).toHaveLength(6);
    expect(events.map(({ occurredAt }) => occurredAt.getTime()))
      .toEqual([...events].map(({ occurredAt }) => occurredAt.getTime()).sort((a, b) => b - a));
  });
});
