import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIntentRepository } from "./intents";
import { startIntegrationDatabase } from "./integration-database";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverRunRepository } from "./solver-runs";
import { createOpenIntentTestPolicy } from "./open-intent-test-fixture";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const nowSec = 2_000_000_000;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = createOpenIntentTestPolicy({ nowSec });

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createIntentRepository(db()).create({ policy, ownerSignature: `0x${"44".repeat(65)}` });
  await createSolverProfileRepository(db()).register({
    id: "cobia-coding-agent", displayName: "Cobia Coding Agent", operatorKind: "internal",
    attestationAddress: null, declaredCapabilities: ["evm.raw@1"],
  });
});
afterAll(async () => { await database?.close(); });

describe("solver run repository", () => {
  it("records abstention without publishing a solver submission", async () => {
    const runs = createSolverRunRepository(db());
    const run = await runs.create({
      intentId: policy.requestId, solverId: "cobia-coding-agent", revision: 1,
      blockNumber: "123", blockHash: hash("3"),
    });
    await runs.start(run.id);
    const abstained = await runs.abstain(run.id);

    expect(abstained).toMatchObject({ state: "abstained", failureCode: null });
    expect(await runs.readBrokerAnchor(run.id)).toMatchObject({ state: "abstained" });
    expect(await runs.listForIntent(policy.requestId)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        solverId: "cobia-coding-agent", displayName: "Cobia Coding Agent",
        revision: 1, state: "abstained",
      }),
    ]));
  });

  it("stores stable failure codes and rejects a second terminal transition", async () => {
    const runs = createSolverRunRepository(db());
    const run = await runs.create({
      intentId: policy.requestId, solverId: "cobia-coding-agent", revision: 2,
      blockNumber: "124", blockHash: hash("4"),
    });
    await runs.start(run.id);
    await expect(runs.fail(run.id, "SANDBOX_FAILED")).resolves.toMatchObject({
      state: "failed", failureCode: "SANDBOX_FAILED",
    });
    await expect(runs.complete(run.id)).rejects.toThrow("already resolved");
  });
});
