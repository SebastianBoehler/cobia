import {
  CapabilityCompositionPolicyV1Schema, CapabilityCompositionSnapshotV1Schema,
  commitment, OpenIntentPolicyV3Schema, OpenIntentSnapshotV1Schema,
} from "@cobia/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ObjectiveMeasurementV1Schema } from "../competitions/objective-measurement";
import { projectCompetitionProgramPreview, projectProgramProtocols } from "../competitions/submission-preview";
import { projectSubmissionState } from "../competitions/submission-state";
import type { CobiaDatabase } from "./client";
import {
  cobiaChallengeRounds, cobiaChallenges, cobiaIntents, cobiaProgramArtifactsV2,
  cobiaSolverSubmissions, cobiaSolvers, programArtifactKindV2,
} from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase());
const AppendBaseSchema = z.object({
  solverId: z.string().min(1), revision: z.number().int().min(1).max(20),
  programHash: HashSchema, validUntilSec: z.number().int().positive().safe(),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/), blockHash: HashSchema,
  observedAtSec: z.number().int().positive().safe(),
});
const AppendSchema = z.union([
  AppendBaseSchema.extend({
    intentId: z.string().uuid(), challengeRoundId: z.never().optional(),
  }).strict(),
  AppendBaseSchema.extend({
    challengeRoundId: z.string().uuid(), intentId: z.never().optional(),
  }).strict(),
]);
const ResolutionSchema = z.object({
  state: z.enum(["rejected", "verified", "attested", "executed", "failed"]),
  failureCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/)).max(32),
}).strict();
const KindSchema = z.enum(programArtifactKindV2.enumValues);

function canonicalArtifact(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalArtifact);
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Artifact must be plain JSON");
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, canonicalArtifact(entry)]));
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value))) return value;
  throw new Error("Artifact is not canonical JSON");
}

function allowedTransition(from: string, to: string): boolean {
  return (from === "proposed" && ["verified", "rejected", "failed"].includes(to)) ||
    (from === "verified" && ["attested", "failed"].includes(to)) ||
    (from === "attested" && to === "executed");
}

async function parentClose(db: CobiaDatabase, input: z.infer<typeof AppendSchema>) {
  if (input.intentId) {
    const intent = await db.query.cobiaIntents.findFirst({ where: eq(cobiaIntents.id, input.intentId) });
    if (!intent) throw new Error("Intent is unavailable");
    return { closesAt: intent.competitionClosesAt, maxRevisions: intent.policy.competition.maxRevisionsPerSolver };
  }
  const round = await db.query.cobiaChallengeRounds.findFirst({
    where: eq(cobiaChallengeRounds.id, input.challengeRoundId!),
  });
  if (!round) throw new Error("Challenge round is unavailable");
  return { closesAt: round.closesAt, maxRevisions: 20 };
}

function rank(rows: Awaited<ReturnType<ReturnType<typeof createSolverSubmissionRepository>["rowsWithState"]>>) {
  return rows.sort((left, right) => {
    const leftObjective = left.objective;
    const rightObjective = right.objective;
    if (leftObjective && rightObjective && leftObjective.direction === rightObjective.direction) {
      const difference = BigInt(leftObjective.atomic) - BigInt(rightObjective.atomic);
      if (difference !== 0n) return Number(difference > 0n ? -1 : 1) *
        (leftObjective.direction === "maximize" ? 1 : -1);
    }
    return left.solverId.localeCompare(right.solverId);
  });
}

export function createSolverSubmissionRepository(db: CobiaDatabase) {
  const repository = {
    async append(value: z.input<typeof AppendSchema>) {
      const input = AppendSchema.parse(value);
      const parent = await parentClose(db, input);
      const observedAt = new Date(input.observedAtSec * 1_000);
      const validUntil = new Date(input.validUntilSec * 1_000);
      if (observedAt >= parent.closesAt) throw new Error("Competition is closed");
      if (validUntil <= observedAt || validUntil > parent.closesAt) {
        throw new Error("Submission validity must fit inside the competition");
      }
      if (input.revision > parent.maxRevisions) throw new Error("Solver revision limit exceeded");
      return db.transaction(async (tx) => {
        const solver = (await tx.select().from(cobiaSolvers)
          .where(eq(cobiaSolvers.id, input.solverId)).for("update"))[0];
        if (!solver) throw new Error("Solver identity is unavailable");
        const parentWhere = input.intentId
          ? eq(cobiaSolverSubmissions.intentId, input.intentId)
          : eq(cobiaSolverSubmissions.challengeRoundId, input.challengeRoundId!);
        const previous = await tx.query.cobiaSolverSubmissions.findMany({
          where: and(parentWhere, eq(cobiaSolverSubmissions.solverId, input.solverId)),
          orderBy: [asc(cobiaSolverSubmissions.revision)],
        });
        const latest = previous.at(-1);
        if (latest && input.revision !== latest.revision + 1) {
          throw new Error("Solver revisions must be sequential");
        }
        if (!latest && input.revision !== 1) throw new Error("First solver revision must be one");
        if (latest && ["verified", "attested"].includes(latest.state)) {
          await tx.update(cobiaSolverSubmissions).set({
            state: "superseded", updatedAt: observedAt, completedAt: observedAt,
          }).where(eq(cobiaSolverSubmissions.id, latest.id));
        }
        const rows = await tx.insert(cobiaSolverSubmissions).values({
          intentId: input.intentId, challengeRoundId: input.challengeRoundId,
          solverId: input.solverId, revision: input.revision, state: "proposed",
          programHash: input.programHash as `0x${string}`, validUntil,
          blockNumber: input.blockNumber, blockHash: input.blockHash as `0x${string}`,
          createdAt: observedAt, updatedAt: observedAt,
        }).returning();
        if (!rows[0]) throw new Error("Solver submission was not stored");
        return rows[0];
      });
    },

    async appendArtifact(id: string, kindValue: z.input<typeof KindSchema>, value: unknown) {
      const kind = KindSchema.parse(kindValue);
      const payload = kind === "objective"
        ? ObjectiveMeasurementV1Schema.parse(value) : canonicalArtifact(value);
      const artifactHash = commitment(payload);
      const rows = await db.insert(cobiaProgramArtifactsV2).values({
        submissionId: id, kind, artifactHash, payload,
      }).returning();
      if (!rows[0]) throw new Error("Program artifact was not stored");
      return rows[0];
    },

    async resolve(id: string, stateValue: z.input<typeof ResolutionSchema>["state"], codes: string[]) {
      const resolution = ResolutionSchema.parse({ state: stateValue, failureCodes: codes });
      return db.transaction(async (tx) => {
        const stored = (await tx.select().from(cobiaSolverSubmissions)
          .where(eq(cobiaSolverSubmissions.id, id)).for("update"))[0];
        if (!stored) throw new Error("Solver submission is unavailable");
        if (!allowedTransition(stored.state, resolution.state)) throw new Error("Invalid submission transition");
        if (resolution.state === "attested" && stored.challengeRoundId) {
          throw new Error("Standing challenge submissions cannot receive execution authority");
        }
        if (resolution.state === "executed") {
          if (!stored.intentId) throw new Error("Executed submission requires an intent");
          const intent = (await tx.select().from(cobiaIntents)
            .where(eq(cobiaIntents.id, stored.intentId)).for("update"))[0];
          if (!intent) throw new Error("Executed submission intent is unavailable");
          if (intent.selectedSubmissionId && intent.selectedSubmissionId !== id) {
            throw new Error("Intent selected a different submission");
          }
          await tx.update(cobiaIntents).set({
            selectedSubmissionId: id, state: "executed", updatedAt: new Date(),
          }).where(eq(cobiaIntents.id, stored.intentId));
        }
        const failures = ["rejected", "failed"].includes(resolution.state);
        if (failures !== (resolution.failureCodes.length > 0)) throw new Error("Submission failure codes mismatch");
        const rows = await tx.update(cobiaSolverSubmissions).set({
          state: resolution.state, failureCodes: resolution.failureCodes,
          completedAt: new Date(), updatedAt: new Date(),
        }).where(eq(cobiaSolverSubmissions.id, id)).returning();
        if (!rows[0]) throw new Error("Solver submission was not resolved");
        return rows[0];
      });
    },

    async rowsWithState(intentId: string, observedAtSec: number) {
      const rows = await db.query.cobiaSolverSubmissions.findMany({
        where: eq(cobiaSolverSubmissions.intentId, intentId),
      });
      const artifacts = rows.length === 0 ? [] : await db.query.cobiaProgramArtifactsV2.findMany({
        where: and(inArray(cobiaProgramArtifactsV2.submissionId, rows.map(({ id }) => id)),
          inArray(cobiaProgramArtifactsV2.kind, ["objective", "snapshot", "program", "evidence", "execution"])),
      });
      const artifactsBySubmission = new Map<string, (typeof artifacts)[number][]>();
      for (const artifact of artifacts) {
        artifactsBySubmission.set(artifact.submissionId, [
          ...(artifactsBySubmission.get(artifact.submissionId) ?? []), artifact,
        ]);
      }
      const objectives = new Map(artifacts.filter(({ kind }) => kind === "objective").map(({ submissionId, payload }) => [
        submissionId, ObjectiveMeasurementV1Schema.parse(payload),
      ]));
      return rows.map((row) => ({
        ...row, objective: objectives.get(row.id) ?? null,
        preview: projectCompetitionProgramPreview(artifactsBySubmission.get(row.id) ?? []),
        presentationState: projectSubmissionState(row, observedAtSec),
      }));
    },

    async read(id: string, observedAtSec: number) {
      const submissionId = z.string().uuid().parse(id);
      const row = await db.query.cobiaSolverSubmissions.findFirst({
        where: eq(cobiaSolverSubmissions.id, submissionId),
      });
      if (!row) return null;
      const artifacts = await db.query.cobiaProgramArtifactsV2.findMany({
        where: eq(cobiaProgramArtifactsV2.submissionId, submissionId),
        orderBy: [asc(cobiaProgramArtifactsV2.id)],
      });
      const intent = row.intentId ? await db.query.cobiaIntents.findFirst({
        where: eq(cobiaIntents.id, row.intentId),
      }) : null;
      const objectiveArtifact = artifacts.find(({ kind }) => kind === "objective");
      return {
        ...row,
        owner: intent?.owner ?? null,
        displayGoal: intent?.displayGoal ?? null,
        artifacts,
        objective: objectiveArtifact
          ? ObjectiveMeasurementV1Schema.parse(objectiveArtifact.payload) : null,
        presentationState: projectSubmissionState(row, observedAtSec),
      };
    },

    async getExecutionContext(id: string) {
      const submissionId = z.string().uuid().parse(id);
      const submission = await db.query.cobiaSolverSubmissions.findFirst({
        where: eq(cobiaSolverSubmissions.id, submissionId),
      });
      if (!submission?.intentId) return null;
      const intent = await db.query.cobiaIntents.findFirst({
        where: eq(cobiaIntents.id, submission.intentId),
      });
      if (!intent) throw new Error("Program intent is unavailable");
      const artifacts = await db.query.cobiaProgramArtifactsV2.findMany({
        where: eq(cobiaProgramArtifactsV2.submissionId, submissionId),
        orderBy: [asc(cobiaProgramArtifactsV2.id)],
      });
      const snapshotArtifact = artifacts.find(({ kind }) => kind === "snapshot");
      if (!snapshotArtifact) throw new Error("Program snapshot artifact is unavailable");
      const composed = intent.policy.kind === "capability-composition";
      const policy = composed
        ? CapabilityCompositionPolicyV1Schema.parse(intent.policy)
        : OpenIntentPolicyV3Schema.parse(intent.policy);
      const snapshot = composed
        ? CapabilityCompositionSnapshotV1Schema.parse(snapshotArtifact.payload)
        : OpenIntentSnapshotV1Schema.parse(snapshotArtifact.payload);
      return {
        state: submission.state,
        solverId: submission.solverId,
        owner: intent.owner,
        policyHash: intent.policyHash,
        snapshotHash: snapshotArtifact.artifactHash,
        blockNumber: submission.blockNumber,
        blockHash: submission.blockHash,
        policy,
        snapshot,
        artifacts,
      };
    },

    async listForIntent(intentId: string, observedAtSec: number) {
      const rows = await repository.rowsWithState(intentId, observedAtSec);
      return {
        current: rank(rows.filter(({ presentationState }) => presentationState === "current")),
        history: rows.filter(({ presentationState }) => presentationState !== "current")
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      };
    },

    async listHistory(observedAtSec: number) {
      const rows = await db.query.cobiaSolverSubmissions.findMany({
        orderBy: [desc(cobiaSolverSubmissions.createdAt)], limit: 30,
      });
      const historical = rows.map((row) => ({
        ...row, presentationState: projectSubmissionState(row, observedAtSec),
      })).filter(({ presentationState }) => !["current", "pending"].includes(presentationState));
      const programArtifacts = historical.length === 0 ? [] : await db.query.cobiaProgramArtifactsV2.findMany({
        where: and(inArray(cobiaProgramArtifactsV2.submissionId, historical.map(({ id }) => id)),
          eq(cobiaProgramArtifactsV2.kind, "program")),
      });
      const programsBySubmission = new Map(programArtifacts.map(
        ({ submissionId, payload }) => [submissionId, payload],
      ));
      return Promise.all(historical.map(async (row) => {
        const solver = await db.query.cobiaSolvers.findFirst({ where: eq(cobiaSolvers.id, row.solverId) });
        if (!solver) throw new Error("Historical submission solver is unavailable");
        const intent = row.intentId
          ? await db.query.cobiaIntents.findFirst({ where: eq(cobiaIntents.id, row.intentId) }) : null;
        const round = row.challengeRoundId
          ? await db.query.cobiaChallengeRounds.findFirst({ where: eq(cobiaChallengeRounds.id, row.challengeRoundId) }) : null;
        const challenge = round
          ? await db.query.cobiaChallenges.findFirst({ where: eq(cobiaChallenges.id, round.challengeId) }) : null;
        const goal = intent?.displayGoal ?? challenge?.displayGoal;
        if (!goal) throw new Error("Historical submission parent is unavailable");
        return { id: row.id, goal, solver: solver.displayName, state: row.presentationState,
          protocols: projectProgramProtocols(programsBySubmission.get(row.id)) };
      }));
    },
  };
  return repository;
}
