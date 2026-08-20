import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createChallengeRepository } from "./challenges";
import { createIntentRepository } from "./intents";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverRunRepository } from "./solver-runs";
import { createSolverSubmissionRepository } from "./solver-submissions";
import { createOpenIntentTestPolicy } from "./open-intent-test-fixture";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const nowSec = 2_000_000_000;
const owner = "0x1111111111111111111111111111111111111111";
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

const policy = createOpenIntentTestPolicy({ nowSec, owner });

beforeAll(async () => {
  database = await startIntegrationDatabase();
  const profiles = createSolverProfileRepository(db());
  await profiles.register({
    id: "alpha-solver", displayName: "Alpha Solver", operatorKind: "internal",
    attestationAddress: null, declaredCapabilities: ["evm.raw@1"],
  });
  await profiles.register({
    id: "beta-solver", displayName: "Beta Solver", operatorKind: "internal",
    attestationAddress: null, declaredCapabilities: ["evm.raw@1"],
  });
});
afterAll(async () => { await database?.close(); });

describe("solver competition projections", () => {
  it("keeps standing challenges discoverable between bounded rounds", async () => {
    const challenges = createChallengeRepository(db());
    await challenges.create({
      id: "best-usdg-supply", title: "Best verified USDG supply",
      displayGoal: "Find the best verified USDG supply outcome",
      policyTemplate: { version: 1, capabilityTemplateId: "aave-supply", parameters: {} },
      manifestHash: hash("2"),
    });
    await challenges.openRound({
      id: "22222222-2222-4222-8222-222222222222",
      challengeId: "best-usdg-supply", opensAtSec: nowSec - 600, closesAtSec: nowSec - 300,
      anchorBlockNumber: "123456", anchorBlockHash: hash("3"),
    });

    const discover = await challenges.listDiscover(nowSec);
    expect(discover).toEqual(expect.arrayContaining([expect.objectContaining({
      id: "best-usdg-supply", availability: "between-rounds",
      currentRound: null,
      latestRound: expect.objectContaining({ id: "22222222-2222-4222-8222-222222222222" }),
    })]));
    await expect(challenges.getActive("best-usdg-supply")).resolves.toMatchObject({
      id: "best-usdg-supply", displayGoal: "Find the best verified USDG supply outcome",
    });
  });

  it("ranks only the newest fresh accepted revision and preserves history", async () => {
    await createIntentRepository(db()).create({
      policy, ownerSignature: `0x${"44".repeat(65)}`,
    });
    const submissions = createSolverSubmissionRepository(db());
    const runs = createSolverRunRepository(db());
    const completeRun = async (solverId: string, revision: number, blockNumber: string, blockHash: `0x${string}`) => {
      const run = await runs.create({ intentId: policy.requestId, solverId, revision, blockNumber, blockHash });
      await runs.start(run.id);
      await runs.complete(run.id);
    };
    await completeRun("alpha-solver", 1, "123456", hash("3"));
    const first = await submissions.append({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 1,
      programHash: hash("5"), validUntilSec: nowSec + 120,
      blockNumber: "123456", blockHash: hash("3"), observedAtSec: nowSec,
    });
    await submissions.resolve(first.id, "verified", []);
    await submissions.resolve(first.id, "attested", []);
    await completeRun("alpha-solver", 2, "123457", hash("7"));
    const second = await submissions.append({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 2,
      programHash: hash("6"), validUntilSec: nowSec + 180,
      blockNumber: "123457", blockHash: hash("7"), observedAtSec: nowSec,
    });
    await submissions.resolve(second.id, "verified", []);
    await submissions.resolve(second.id, "attested", []);
    await submissions.appendArtifact(second.id, "objective", {
      version: 1, kind: "atomic-value", direction: "maximize", atomic: "10080000",
    });
    await completeRun("beta-solver", 1, "123457", hash("7"));
    const rejected = await submissions.append({
      intentId: policy.requestId, solverId: "beta-solver", revision: 1,
      programHash: hash("8"), validUntilSec: nowSec + 180,
      blockNumber: "123457", blockHash: hash("7"), observedAtSec: nowSec,
    });
    await submissions.resolve(rejected.id, "rejected", ["FINAL_BALANCE_TOO_LOW"]);
    await completeRun("beta-solver", 2, "123458", hash("a"));
    const betaSecond = await submissions.append({
      intentId: policy.requestId, solverId: "beta-solver", revision: 2,
      programHash: hash("9"), validUntilSec: nowSec + 180,
      blockNumber: "123458", blockHash: hash("a"), observedAtSec: nowSec,
    });
    await submissions.resolve(betaSecond.id, "verified", []);
    await submissions.resolve(betaSecond.id, "attested", []);
    await submissions.appendArtifact(betaSecond.id, "objective", {
      version: 1, kind: "atomic-value", direction: "maximize", atomic: "10080000",
    });

    const view = await submissions.listForIntent(policy.requestId, nowSec);
    expect(view.current.map(({ solverId }) => solverId)).toEqual(["alpha-solver", "beta-solver"]);
    expect(view.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, presentationState: "superseded" }),
      expect.objectContaining({ id: rejected.id, presentationState: "rejected" }),
    ]));
    await expect(submissions.append({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 4,
      programHash: hash("b"), validUntilSec: nowSec + 200,
      blockNumber: "123459", blockHash: hash("c"), observedAtSec: nowSec,
    })).rejects.toThrow("revision limit");
    await expect(submissions.append({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 3,
      programHash: hash("b"), validUntilSec: nowSec + 301,
      blockNumber: "123459", blockHash: hash("c"),
      observedAtSec: policy.competition.closesAt,
    })).rejects.toThrow("Competition is closed");

  });

  it("derives solver statistics and wins from verifier-owned rows", async () => {
    const submissions = createSolverSubmissionRepository(db());
    const view = await submissions.listForIntent(policy.requestId, nowSec);
    await createIntentRepository(db()).select(policy.requestId, view.current[0]!.id, nowSec);

    const profile = await createSolverProfileRepository(db()).read("alpha-solver", nowSec);
    expect(profile).toMatchObject({
      id: "alpha-solver",
      stats: { accepted: 2, rejected: 0, wins: 1, current: 1 },
      performance: [expect.objectContaining({
        segment: { chainId: 196, intentClass: "general" },
        counts: expect.objectContaining({
          observedIntents: 1, submittedIntents: 1, submissions: 2,
          acceptedSubmissions: 2, wonIntents: 1,
        }),
        rates: expect.objectContaining({
          verifierAcceptance: expect.objectContaining({ rateBps: 10_000, denominator: 2 }),
          win: expect.objectContaining({ rateBps: 10_000, denominator: 1 }),
        }),
      })],
    });
    expect(profile?.submissions.map(({ presentationState }) => presentationState))
      .toEqual(expect.arrayContaining(["current", "superseded"]));
  });
});
