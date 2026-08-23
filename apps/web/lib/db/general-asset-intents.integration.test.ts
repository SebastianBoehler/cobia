import { commitment, GeneralAssetPolicyV1Schema, GeneralAssetProgramV1Schema } from "@cobia/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createSolverSubmissionRepository } from "./solver-submissions";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const nowSec = 2_000_000_000;

const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap exact arbitrary assets", owner, sourceChainId: 1, destinationChainId: 196,
  nonce: hash("1"), createdAt: nowSec, deadline: nowSec + 600,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  manifestHash: hash("2"), inputIdentityHash: hash("3"), inputValuationHash: hash("4"),
  input: { chainId: 1, token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90", identityHash: hash("5") }],
  allowedAdapters: [{ id: "lifi.route", version: 1 }],
  limits: { maxStages: 2, maxCallsPerStage: 2, maxApprovals: 4, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1000000", maxBridgeFeeUsdE8: "1000000",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const stageId = hash("6");
const program = GeneralAssetProgramV1Schema.parse({
  version: 1, kind: "general-asset-program", policyHash: commitment(policy), manifestHash: policy.manifestHash,
  canonicalProgramHash: hash("7"), owner, deadline: nowSec + 500,
  identityEvidenceHashes: [policy.inputIdentityHash, policy.outputs[0]!.identityHash].sort(),
  valuationEvidenceHashes: [policy.inputValuationHash], stages: [{ stageId, index: 0, chainId: 196,
    predecessorStageId: null, adapter: { id: "lifi.route", version: 1 }, target,
    targetRuntimeCodeHash: hash("8"), calldata: "0x12345678", nativeValueAtomic: "0",
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: policy.inputIdentityHash, valuationEvidenceHash: policy.inputValuationHash },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "90",
      identityEvidenceHash: policy.outputs[0]!.identityHash }],
    approvals: [], refundTokens: [inputToken, outputToken].sort(), finality: { confirmations: 12 },
    delivery: { kind: "none" } }],
  finalOutput: { chainId: 196, token: outputToken, minimumAtomic: "90" },
});

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => { database = await startIntegrationDatabase(); });
afterAll(async () => { await database?.close(); });

describe("general asset intent persistence", () => {
  it("reads V4 policy and program without a legacy snapshot", async () => {
    await db().execute(sql`INSERT INTO cobia_solvers
      (id, display_name, operator_kind, attestation_address, declared_capabilities)
      VALUES ('v4-solver', 'V4 Solver', 'internal', NULL, '["general-asset@1"]'::jsonb)`);
    await createIntentRepository(db()).create({ policy, ownerSignature: `0x${"11".repeat(65)}` });
    const submissions = createSolverSubmissionRepository(db());
    const submission = await submissions.append({ intentId: policy.requestId, solverId: "v4-solver",
      revision: 1, programHash: commitment(program), validUntilSec: nowSec + 200,
      blockNumber: "123", blockHash: hash("9"), observedAtSec: nowSec + 10 });
    await submissions.appendArtifact(submission.id, "program", program);

    await expect(submissions.getExecutionContext(submission.id)).resolves.toMatchObject({
      policy, program, snapshot: null,
    });
  });
});
