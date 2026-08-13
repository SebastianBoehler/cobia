import { commitment } from "@cobia/domain";
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
