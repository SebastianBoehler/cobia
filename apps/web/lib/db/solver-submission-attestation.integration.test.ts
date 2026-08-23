import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createOpenIntentTestPolicy } from "./open-intent-test-fixture";
import { cobiaSolverSubmissions } from "./schema";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverSubmissionRepository } from "./solver-submissions";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const owner = "0x1111111111111111111111111111111111111111";
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createSolverProfileRepository(db()).register({
    id: "expiry-race-solver", displayName: "Expiry Race Solver", operatorKind: "internal",
    attestationAddress: null, declaredCapabilities: ["evm.raw@1"],
  });
});
afterAll(async () => { await database?.close(); });

describe("solver submission attestation", () => {
  it("uses the live database clock after a row-lock wait crosses expiry", async () => {
    const nowSec = Math.floor(Date.now() / 1_000);
    const policy = createOpenIntentTestPolicy({ requestId: crypto.randomUUID(), owner, nowSec });
    await createIntentRepository(db()).create({
      policy, ownerSignature: `0x${"44".repeat(65)}`,
    });
    const submissions = createSolverSubmissionRepository(db());
    const submission = await submissions.append({
      intentId: policy.requestId, solverId: "expiry-race-solver", revision: 1,
      programHash: hash("1"), validUntilSec: nowSec + 2,
      blockNumber: "123", blockHash: hash("2"), observedAtSec: nowSec,
    });
    await submissions.resolve(submission.id, "verified", []);
    let unlock: () => void = () => {};
    let reportLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const release = new Promise<void>((resolve) => { unlock = resolve; });
    const lock = db().transaction(async (transaction) => {
      await transaction.select({ id: cobiaSolverSubmissions.id }).from(cobiaSolverSubmissions)
        .where(eq(cobiaSolverSubmissions.id, submission.id)).for("update");
      reportLocked();
      await release;
    });
    await locked;
    const attestation = expect(submissions.resolve(submission.id, "attested", []))
      .rejects.toThrow(/expired/i);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    unlock();
    await lock;

    await attestation;
    await expect(submissions.read(submission.id, nowSec)).resolves.toMatchObject({ state: "verified" });
  });
});
