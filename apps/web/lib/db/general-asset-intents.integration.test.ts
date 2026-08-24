import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema, commitment,
  GeneralAssetPolicyV1Schema, GeneralAssetProgramV1Schema } from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema } from "@cobia/solvers";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createOpenIntentTestPolicy } from "./open-intent-test-fixture";
import { createSolverSubmissionRepository } from "./solver-submissions";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const spender = "0x5555555555555555555555555555555555555555" as const;
const nowSec = 2_000_000_000;

const identity = (token: typeof inputToken | typeof outputToken, byte: string) =>
  AssetIdentityEvidenceV1Schema.parse({ version: 1, chainId: 196, token,
    runtimeCodeHash: hash(byte), proxy: { kind: "none" }, decimals: 18,
    behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("9"),
    capturedAtSec: nowSec, expiresAtSec: nowSec + 300 });
const inputIdentity = identity(inputToken, "a");
const outputIdentity = identity(outputToken, "b");
const valuation = AssetValuationEvidenceV1Schema.parse({ version: 1,
  assetIdentityHash: commitment(inputIdentity), referenceAsset: { chainId: 196, token: outputToken },
  inputAtomic: "100", conservativeValueUsdE8: "100000000", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
    referenceValueUsdE8: "100000000", liquidityUsdE8: "1000000000", priceImpactBps: 0,
    fetchedAtSec: nowSec, expiresAtSec: nowSec + 300, quoteHash: hash("c") }],
  capturedAtSec: nowSec, expiresAtSec: nowSec + 300 });
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const, target,
  runtimeCodeHash: hash("d"), selectors: ["0x12345678" as const],
  approvalSpenders: [{ address: spender, runtimeCodeHash: hash("e") }] }] };
const evidence = GeneralAssetEvidenceArtifactV1Schema.parse({ version: 1,
  kind: "general-asset-evidence", identities: [inputIdentity, outputIdentity],
  valuations: [valuation], manifest });
const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap exact arbitrary assets", owner, sourceChainId: 196, destinationChainId: 196,
  nonce: hash("1"), createdAt: nowSec, deadline: nowSec + 600,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  manifestHash: commitment(manifest), inputIdentityHash: commitment(inputIdentity),
  inputValuationHash: commitment(valuation), input: { chainId: 196, token: inputToken,
    maximumAtomic: "100", maximumUsdE8: "100000000" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }], allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const stageId = hash("6");
const program = GeneralAssetProgramV1Schema.parse({
  version: 1, kind: "general-asset-program", policyHash: commitment(policy), manifestHash: policy.manifestHash,
  canonicalProgramHash: hash("7"), owner, deadline: nowSec + 500,
  identityEvidenceHashes: [policy.inputIdentityHash, policy.outputs[0]!.identityHash].sort(),
  valuationEvidenceHashes: [policy.inputValuationHash], stages: [{ stageId, index: 0, chainId: 196,
    predecessorStageId: null, calls: [{ adapter: { id: "okx.swap", version: 1 }, target,
      targetRuntimeCodeHash: hash("d"), calldata: "0x12345678", nativeValueAtomic: "0", gasLimit: 300_000,
      approvals: [{ token: inputToken, spender, maximumAtomic: "100" }] }],
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: policy.inputIdentityHash, valuationEvidenceHash: policy.inputValuationHash },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "90",
      identityEvidenceHash: policy.outputs[0]!.identityHash }],
    refundTokens: [inputToken, outputToken].sort(), finality: { confirmations: 12 },
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
  it("rejects a general asset without evidence while legacy V3 evidence remains null", async () => {
    const intents = createIntentRepository(db());
    await expect(intents.create({ policy, ownerSignature: `0x${"11".repeat(65)}` }))
      .rejects.toThrow("General asset evidence");
    const legacy = createOpenIntentTestPolicy({ requestId: "550e8400-e29b-41d4-a716-446655440099" });
    const stored = await intents.create({ policy: legacy, ownerSignature: `0x${"12".repeat(65)}` });
    expect(stored).toMatchObject({ generalAssetEvidence: null, generalAssetEvidenceHash: null });
  });

  it("reads exact V4 evidence and program without a legacy snapshot", async () => {
    await db().execute(sql`INSERT INTO cobia_solvers
      (id, display_name, operator_kind, attestation_address, declared_capabilities)
      VALUES ('v4-solver', 'V4 Solver', 'internal', NULL, '["general-asset@1"]'::jsonb)`);
    const stored = await createIntentRepository(db()).create({ policy,
      ownerSignature: `0x${"11".repeat(65)}`, generalAssetEvidence: evidence });
    expect(stored).toMatchObject({ generalAssetEvidence: evidence,
      generalAssetEvidenceHash: commitment(evidence) });
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
