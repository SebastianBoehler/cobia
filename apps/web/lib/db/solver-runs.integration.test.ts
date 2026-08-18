import { GeneralIntentPolicyV2Schema } from "@cobia/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIntentRepository } from "./intents";
import { startIntegrationDatabase } from "./integration-database";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverRunRepository } from "./solver-runs";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const nowSec = 2_000_000_000;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = GeneralIntentPolicyV2Schema.parse({
  version: 2, kind: "general-onchain", requestId: "11111111-1111-4111-8111-111111111111",
  displayGoal: "Supply USDG", owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196, nonce: hash("1"), createdAt: nowSec - 60, deadline: nowSec + 900,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 3 },
  maxEvidenceAgeSec: 300, manifestHash: hash("2"),
  input: { token: "0x2222222222222222222222222222222222222222", maxAtomic: "10000000" },
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 1, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [], balanceConstraints: [{
    kind: "minimumIncrease", token: "0x3333333333333333333333333333333333333333",
    atomic: "9950000",
  }], predicates: [],
  objective: { kind: "satisfy" },
});

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createIntentRepository(db()).create({ policy, ownerSignature: `0x${"44".repeat(65)}` });
  await createSolverProfileRepository(db()).register({
    id: "cobia-coding-agent", displayName: "Cobia Coding Agent", operatorKind: "internal",
    attestationAddress: null, declaredCapabilities: ["aave-v3.supply"],
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
