import { CapabilityProgramV2Schema } from "@cobia/solvers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";
import { captureCapabilityCompositionSnapshotV1 } from "../open-exchange/capture-composition-snapshot";
import { block, dependencies, usdg, usdt0 } from "../orchestrator/capture-route-snapshot-v2.test-fixture";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createNetworkOutcomeRepository } from "./network-outcomes";
import { createOpenIntentSnapshotRepository } from "./open-intent-snapshots";
import { createSolverProfileRepository } from "./solver-profiles";
import { createSolverSubmissionRepository } from "./solver-submissions";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const nowSec = Math.floor(Date.now() / 1_000);
const owner = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"ab".repeat(32)}`;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

async function createExecutedOutcome(input: {
  requestId: string;
  nonceByte: string;
  withReceipt: boolean;
  withSwap?: boolean;
}) {
  const policy = buildCapabilityCompositionPolicyV1({
    requestId: input.requestId,
    owner,
    inputToken: usdt0,
    inputAtomic: "1000000",
    nonce: `0x${input.nonceByte.repeat(64)}`,
    nowSec,
    displayGoal: "Private raw goal that must never be public",
    competitionDurationSec: 300,
    deadlineDurationSec: 600,
    maxConversionLossBps: 100,
    minimumReceiptValueBps: 9_900,
    horizonDays: 30,
    forbiddenTargets: [],
  });
  const snapshot = await captureCapabilityCompositionSnapshotV1(policy, {
    route: dependencies(),
    getGasPrice: async () => 1_000_000_000n,
    getNativeToken: async () => ({
      chainId: 196,
      token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      symbol: "OKB",
      decimals: 18,
      priceUsd: "107.41",
    }),
  });
  await createIntentRepository(db()).create({
    policy,
    ownerSignature: `0x${"44".repeat(65)}`,
  });
  await createOpenIntentSnapshotRepository(db()).create(snapshot);

  const program = CapabilityProgramV2Schema.parse({
    version: 2,
    kind: "general-onchain",
    requestId: policy.requestId,
    chainId: 196,
    policyHash: `0x${"22".repeat(32)}`,
    manifestHash: policy.manifestHash,
    owner,
    executor: "0x2222222222222222222222222222222222222222",
    pinnedBlock: { number: snapshot.route.blockNumber, hash: snapshot.route.blockHash },
    deadline: policy.deadline,
    nonce: policy.nonce,
    input: { token: policy.input.token, atomic: policy.input.maxAtomic },
    actions: [...(input.withSwap ? [{
      capabilityId: "curve-stableswap-ng.exact-input",
      capabilityVersion: 1,
      valueAtomic: "0",
      parameters: {
        tokenIn: policy.input.token,
        tokenOut: usdg,
        amountInAtomic: policy.input.maxAtomic,
        minimumOutputAtomic: "999000",
      },
    }] : []), {
      capabilityId: "aave-v3.supply",
      capabilityVersion: 1,
      valueAtomic: "0",
      parameters: { asset: policy.input.token, amountAtomic: policy.input.maxAtomic },
    }],
    balanceConstraints: [{
      kind: "minimumIncrease",
      token: "0x3333333333333333333333333333333333333333",
      atomic: "999000",
    }],
    predicates: [],
    objective: { kind: "satisfy" },
  });
  const submissions = createSolverSubmissionRepository(db());
  const submission = await submissions.append({
    intentId: policy.requestId,
    solverId: "alpha-solver",
    revision: 1,
    programHash: `0x${input.nonceByte.repeat(64)}`,
    validUntilSec: nowSec + 240,
    blockNumber: snapshot.route.blockNumber,
    blockHash: snapshot.route.blockHash,
    observedAtSec: nowSec,
  });
  await submissions.appendArtifact(submission.id, "program", program);
  await submissions.appendArtifact(submission.id, "snapshot", snapshot);
  if (input.withReceipt) {
    await submissions.appendArtifact(submission.id, "receipt", {
      version: 3,
      transactionHash,
      blockNumber: snapshot.route.blockNumber,
      blockHash: snapshot.route.blockHash,
      owner,
    });
  }
  await submissions.resolve(submission.id, "verified", []);
  await submissions.resolve(submission.id, "attested", []);
  await submissions.resolve(submission.id, "executed", []);
  return submission;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createSolverProfileRepository(db()).register({
    id: "alpha-solver",
    displayName: "Alpha Solver",
    operatorKind: "internal",
    attestationAddress: null,
    declaredCapabilities: ["aave-v3.supply@1"],
  });
});
afterAll(async () => { await database?.close(); });

describe("network outcome repository", () => {
  it("projects confirmed evidence and reports incomplete executed rows without leaking goals", async () => {
    await createExecutedOutcome({
      requestId: "550e8400-e29b-41d4-a716-446655440091",
      nonceByte: "1",
      withReceipt: true,
      withSwap: true,
    });
    await createExecutedOutcome({
      requestId: "550e8400-e29b-41d4-a716-446655440092",
      nonceByte: "2",
      withReceipt: false,
    });

    const result = await createNetworkOutcomeRepository(db()).read({
      window: "all",
      limit: 20,
      cursor: null,
      observedAtSec: nowSec + 400,
    });

    expect(result.metrics.totals).toEqual({
      confirmedOutcomes: 1,
      valuedOutcomes: 1,
      unvaluedOutcomes: 0,
      verifiedVolumeUsdE8: "99912234",
    });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        solverId: "alpha-solver",
        ownerLabel: "0x1111…1111",
        transactionHash,
        intentClass: "yield-composition",
        resultLabel: "Verified swap and supply",
        route: {
          protocols: ["Curve", "Aave V3"],
          minimumOutputs: [expect.objectContaining({ symbol: "Token 0x3333…3333", atomic: "999000" })],
        },
        volumeUsdE8: "99912234",
      }),
    ]);
    expect(result.exclusions).toEqual({ RECEIPT_MISSING: 1 });
    expect(JSON.stringify(result)).not.toContain("Private raw goal");
    expect(JSON.stringify(result)).not.toContain(owner);
  });
});
