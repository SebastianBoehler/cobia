import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;

const intentId = "11111111-1111-4111-8111-111111111111";
const roundId = "22222222-2222-4222-8222-222222222222";
const submissionId = "33333333-3333-4333-8333-333333333333";
const owner = "0x1111111111111111111111111111111111111111";
const hash = (byte: string) => `0x${byte.repeat(64)}`;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => { database = await startIntegrationDatabase(); });
afterAll(async () => { await database?.close(); });

async function seedParents() {
  await db().execute(sql`
    INSERT INTO cobia_solvers
      (id, display_name, operator_kind, attestation_address, declared_capabilities)
    VALUES ('cobia-coding-agent', 'Cobia Coding Agent', 'internal', NULL,
      '["aave-v3.supply"]'::jsonb)
  `);
  await db().execute(sql`
    INSERT INTO cobia_challenges
      (id, chain_id, title, display_goal, policy_template, manifest_hash, status)
    VALUES ('best-usdg-supply', 196, 'Best verified USDG supply',
      'Find the best verified USDG supply outcome',
      '{"templateId":"aave-supply"}'::jsonb, ${hash("1")}, 'active')
  `);
  await db().execute(sql`
    INSERT INTO cobia_challenge_rounds
      (id, challenge_id, opens_at, closes_at, anchor_block_number, anchor_block_hash)
    VALUES (${roundId}::uuid, 'best-usdg-supply',
      '2033-05-18T03:30:00Z', '2033-05-18T03:35:00Z', '123456', ${hash("2")})
  `);
  await db().execute(sql`
    INSERT INTO cobia_intents
      (id, owner, chain_id, display_goal, policy_hash, policy, owner_signature,
       state, competition_closes_at)
    VALUES (${intentId}::uuid, ${owner}, 196, 'Supply 10 USDG safely', ${hash("3")},
      ${JSON.stringify({
        version: 2, kind: "general-onchain", requestId: intentId,
        displayGoal: "Supply 10 USDG safely", owner, executionChainId: 196,
        competition: { closesAt: 2_000_000_300 },
      })}::jsonb, ${`0x${"44".repeat(65)}`}, 'collecting',
      to_timestamp(2000000300))
  `);
}

describe("general solver competition schema", () => {
  it("separates sandbox runs from published immutable submissions", async () => {
    const rows = await db().execute(sql<{
      runs: string | null; execution_kind: boolean;
    }>`SELECT
      to_regclass('public.cobia_solver_runs')::text AS runs,
      EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'cobia_program_artifact_kind_v2'::regtype
          AND enumlabel = 'execution'
      ) AS execution_kind
    `);
    expect(rows[0]).toEqual({ runs: "cobia_solver_runs", execution_kind: true });
  });

  it("creates a clean model without copying or dropping legacy audit rows", async () => {
    const rows = await db().execute(sql<{
      legacy: string | null; current: string | null; intents: number;
    }>`SELECT
      to_regclass('public.cobia_requests')::text AS legacy,
      to_regclass('public.cobia_intents')::text AS current,
      (SELECT count(*)::int FROM cobia_intents) AS intents
    `);
    expect(rows[0]).toEqual({
      legacy: "cobia_requests", current: "cobia_intents", intents: 0,
    });
  });

  it("stores standing rounds and custom intents without mixing their authority", async () => {
    await seedParents();
    await db().execute(sql`
      INSERT INTO cobia_solver_submissions
        (id, intent_id, solver_id, revision, state, program_hash, valid_until,
         block_number, block_hash, failure_codes)
      VALUES (${submissionId}::uuid, ${intentId}::uuid, 'cobia-coding-agent', 1,
        'verified', ${hash("5")}, '2033-05-18T03:35:00Z', '123456', ${hash("2")}, '{}')
    `);
    const rows = await db().execute(sql<{ intent_id: string | null; round_id: string | null }>`
      SELECT intent_id::text, challenge_round_id::text AS round_id
      FROM cobia_solver_submissions WHERE id = ${submissionId}::uuid
    `);
    expect(rows[0]).toEqual({ intent_id: intentId, round_id: null });

    await expect(db().execute(sql`
      INSERT INTO cobia_solver_submissions
        (intent_id, challenge_round_id, solver_id, revision, state, program_hash,
         valid_until, block_number, block_hash, failure_codes)
      VALUES (${intentId}::uuid, ${roundId}::uuid, 'cobia-coding-agent', 2,
        'verified', ${hash("6")}, '2033-05-18T03:35:00Z', '123456', ${hash("2")}, '{}')
    `)).rejects.toThrow();
  });

  it("keeps revisions unique and program artifacts immutable", async () => {
    await expect(db().execute(sql`
      INSERT INTO cobia_solver_submissions
        (intent_id, solver_id, revision, state, program_hash, valid_until,
         block_number, block_hash, failure_codes)
      VALUES (${intentId}::uuid, 'cobia-coding-agent', 1, 'verified', ${hash("7")},
        '2033-05-18T03:35:00Z', '123456', ${hash("2")}, '{}')
    `)).rejects.toThrow();

    await expect(db().execute(sql`
      UPDATE cobia_solver_submissions SET program_hash = ${hash("9")}
      WHERE id = ${submissionId}::uuid
    `)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/identity is immutable/i) }),
    });

    await db().execute(sql`
      INSERT INTO cobia_program_artifacts_v2
        (submission_id, kind, artifact_hash, payload)
      VALUES (${submissionId}::uuid, 'program', ${hash("8")}, '{"version":2}'::jsonb)
    `);
    await expect(db().execute(sql`
      UPDATE cobia_program_artifacts_v2 SET payload = '{"changed":true}'::jsonb
      WHERE submission_id = ${submissionId}::uuid AND kind = 'program'
    `)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }),
    });
  });

  it("requires community solvers to declare an attestation address", async () => {
    await expect(db().execute(sql`
      INSERT INTO cobia_solvers
        (id, display_name, operator_kind, attestation_address, declared_capabilities)
      VALUES ('community-no-key', 'Community no key', 'community', NULL, '[]'::jsonb)
    `)).rejects.toThrow();
  });
});
