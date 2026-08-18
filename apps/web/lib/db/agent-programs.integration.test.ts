import { GeneralIntentPolicyV1Schema, GeneralIntentSnapshotV1Schema, commitment } from "@cobia/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createAgentProgramRepository } from "./agent-programs";
import { createRepositoryFixtureV2 } from "./repository-test-fixtures";
import { createRequestRepository } from "./requests";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => { database = await startIntegrationDatabase(); });
afterAll(async () => { await database?.close(); });

describe("agent program audit repository", () => {
  it("persists a general policy and pinned snapshot without routing it through quote artifacts", async () => {
    const requestId = crypto.randomUUID();
    const policy = GeneralIntentPolicyV1Schema.parse({
      version: 1, kind: "general-onchain", requestId,
      owner: "0x1111111111111111111111111111111111111111", executionChainId: 196,
      nonce: `0x${"12".repeat(32)}`, createdAt: 2_000_000_000, deadline: 2_000_001_800,
      maxEvidenceAgeSec: 300, manifestHash: `0x${"23".repeat(32)}`,
      input: { token: "0x2222222222222222222222222222222222222222", maxAtomic: "10000000" },
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
      limits: { maxActions: 1, maxApprovals: 1, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
      forbiddenTargets: [], forbiddenAssets: [],
      balanceConstraints: [{ kind: "minimumIncrease", token: "0x3333333333333333333333333333333333333333", atomic: "9950000" }],
      predicates: [], objective: { kind: "satisfy" },
    });
    const snapshot = GeneralIntentSnapshotV1Schema.parse({
      version: 1, kind: "general-onchain", requestId, chainId: 196,
      blockNumber: "123", blockHash: `0x${"34".repeat(32)}`,
      capturedAt: "2033-05-18T03:33:20.000Z", manifestHash: policy.manifestHash,
    });
    const requests = createRequestRepository(db());
    await requests.createRequest(policy);
    await requests.saveSnapshot(requestId, snapshot);
    const programs = createAgentProgramRepository(db());
    const job = await programs.create({
      requestId, owner: policy.owner, policyHash: commitment(policy),
      snapshotHash: commitment(snapshot), manifestHash: policy.manifestHash,
      blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash,
    });

    await expect(programs.getExecutionContext(job.id)).resolves.toMatchObject({ policy, snapshot });
  });

  it("persists immutable commitment-bound artifacts through attestation", async () => {
    const fixture = await createRepositoryFixtureV2();
    await createRequestRepository(db()).createRequest(fixture.policy);
    const programs = createAgentProgramRepository(db());
    const input = {
      requestId: fixture.policy.requestId,
      owner: fixture.policy.owner,
      policyHash: commitment(fixture.policy),
      snapshotHash: commitment(fixture.snapshot),
      manifestHash: fixture.snapshot.adapterRegistryHash,
      blockNumber: fixture.snapshot.blockNumber,
      blockHash: fixture.snapshot.blockHash,
    };
    const queued = await programs.create(input);
    expect(await programs.create(input)).toEqual(queued);
    await programs.start(queued.id);

    for (const kind of ["program", "evidence", "provenance", "verdict", "replay", "execution"] as const) {
      const payload = { kind, requestId: input.requestId, ...(kind === "execution" ? { inputAmount: 10n } : {}) };
      const artifact = await programs.append(queued.id, kind, payload);
      expect(await programs.append(queued.id, kind, payload)).toEqual(artifact);
      await expect(programs.append(queued.id, kind, { changed: true }))
        .rejects.toThrow("conflicts");
    }
    const verified = await programs.markVerified(queued.id);
    expect(verified.state).toBe("verified");
    await programs.append(queued.id, "authorization", { signature: `0x${"11".repeat(65)}` });
    const attested = await programs.markAttested(queued.id);
    expect(attested.state).toBe("attested");
    await expect(programs.fail(queued.id, "LATE_FAILURE")).rejects.toThrow("resolved");
    expect((await programs.get(queued.id))?.artifacts.map(({ kind }) => kind)).toEqual([
      "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
    ]);
    expect((await programs.get(queued.id))?.artifacts.find(({ kind }) => kind === "execution")?.payload)
      .toMatchObject({ inputAmount: "10" });
  });

  it("records a verifier rejection without manufacturing executable artifacts", async () => {
    const fixture = await createRepositoryFixtureV2();
    fixture.policy.requestId = crypto.randomUUID();
    fixture.snapshot.requestId = fixture.policy.requestId;
    await createRequestRepository(db()).createRequest(fixture.policy);
    const programs = createAgentProgramRepository(db());
    const job = await programs.create({
      requestId: fixture.policy.requestId,
      owner: fixture.policy.owner,
      policyHash: commitment(fixture.policy),
      snapshotHash: commitment(fixture.snapshot),
      manifestHash: fixture.snapshot.adapterRegistryHash,
      blockNumber: fixture.snapshot.blockNumber,
      blockHash: fixture.snapshot.blockHash,
    });
    await programs.start(job.id);
    await programs.append(job.id, "verdict", { accepted: false, errorCodes: ["REPLAY_MISMATCH"] });
    const rejected = await programs.reject(job.id, "REPLAY_MISMATCH");
    expect(rejected.state).toBe("rejected");
    expect((await programs.get(job.id))?.artifacts).toHaveLength(1);
    await expect(programs.markVerified(job.id)).rejects.toThrow("running");
  });

  it("can fail a verified program when attestation does not complete", async () => {
    const fixture = await createRepositoryFixtureV2();
    fixture.policy.requestId = crypto.randomUUID();
    fixture.snapshot.requestId = fixture.policy.requestId;
    await createRequestRepository(db()).createRequest(fixture.policy);
    const programs = createAgentProgramRepository(db());
    const job = await programs.create({
      requestId: fixture.policy.requestId,
      owner: fixture.policy.owner,
      policyHash: commitment(fixture.policy),
      snapshotHash: commitment(fixture.snapshot),
      manifestHash: fixture.snapshot.adapterRegistryHash,
      blockNumber: fixture.snapshot.blockNumber,
      blockHash: fixture.snapshot.blockHash,
    });
    await programs.start(job.id);
    for (const kind of ["program", "evidence", "provenance", "verdict", "replay", "execution"] as const) {
      await programs.append(job.id, kind, { kind });
    }
    await programs.markVerified(job.id);

    const failed = await programs.fail(job.id, "ATTESTATION_FAILED");
    expect(failed.state).toBe("failed");
    expect(failed.failureCode).toBe("ATTESTATION_FAILED");
    await expect(programs.append(job.id, "authorization", {})).rejects.toThrow("cannot accept");
  });
});
