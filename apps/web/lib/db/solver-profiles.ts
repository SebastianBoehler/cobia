import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { projectSubmissionState } from "../competitions/submission-state";
import { ObjectiveMeasurementV1Schema } from "../competitions/objective-measurement";
import { projectSelectedSubmissionId } from "../competitions/intent-resolution";
import type { CobiaDatabase } from "./client";
import { cobiaProgramArtifactsV2, cobiaSolverSubmissions, cobiaSolvers } from "./schema";
import { cobiaSolverRuns } from "./schema";
import { projectSolverPerformance } from "./solver-performance-projection";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value.toLowerCase());
const ProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1).max(80),
  operatorKind: z.enum(["internal", "community"]),
  attestationAddress: AddressSchema.nullable(),
  declaredCapabilities: z.array(z.string().min(1)).max(32),
}).strict().superRefine((value, context) => {
  if (value.operatorKind === "community" && !value.attestationAddress) {
    context.addIssue({ code: "custom", path: ["attestationAddress"], message: "Community solver requires attestation" });
  }
});

export function solverProfileIdentityMatches(
  stored: Pick<typeof cobiaSolvers.$inferSelect, "operatorKind" | "attestationAddress">,
  input: Pick<z.infer<typeof ProfileSchema>, "operatorKind" | "attestationAddress">,
) {
  return stored.operatorKind === input.operatorKind &&
    stored.attestationAddress === input.attestationAddress;
}

export function solverCapabilityAvailable(
  profiles: Pick<typeof cobiaSolvers.$inferSelect, "declaredCapabilities" | "updatedAt">[],
  capability: string,
  observedAtSec: number,
  maximumAgeSec = 300,
) {
  const minimumUpdatedAtMs = (observedAtSec - maximumAgeSec) * 1_000;
  return profiles.some(({ declaredCapabilities, updatedAt }) =>
    updatedAt.getTime() >= minimumUpdatedAtMs && declaredCapabilities.includes(capability));
}

export function createSolverProfileRepository(db: CobiaDatabase) {
  const repository = {
    async register(value: z.input<typeof ProfileSchema>) {
      const input = ProfileSchema.parse(value);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaSolvers.findFirst({ where: eq(cobiaSolvers.id, input.id) });
        if (stored) {
          if (!solverProfileIdentityMatches(stored, input)) throw new Error("Solver profile conflicts");
          const rows = await tx.update(cobiaSolvers).set({
            displayName: input.displayName,
            declaredCapabilities: input.declaredCapabilities,
            updatedAt: new Date(),
          }).where(eq(cobiaSolvers.id, input.id)).returning();
          if (!rows[0]) throw new Error("Solver profile was not updated");
          return rows[0];
        }
        const rows = await tx.insert(cobiaSolvers).values({
          ...input,
          attestationAddress: input.attestationAddress as `0x${string}` | null,
        }).returning();
        if (!rows[0]) throw new Error("Solver profile was not stored");
        return rows[0];
      });
    },

    async read(id: string, observedAtSec: number) {
      const profile = await db.query.cobiaSolvers.findFirst({ where: eq(cobiaSolvers.id, id) });
      if (!profile) return null;
      const submissions = await db.query.cobiaSolverSubmissions.findMany({
        where: eq(cobiaSolverSubmissions.solverId, id),
        orderBy: [desc(cobiaSolverSubmissions.createdAt)],
      });
      const objectiveArtifacts = submissions.length === 0 ? []
        : await db.query.cobiaProgramArtifactsV2.findMany({
          where: and(inArray(cobiaProgramArtifactsV2.submissionId, submissions.map(({ id }) => id)),
            eq(cobiaProgramArtifactsV2.kind, "objective")),
        });
      const objectives = new Map(objectiveArtifacts.map(({ submissionId, payload }) => {
        const objective = ObjectiveMeasurementV1Schema.parse(payload);
        return [submissionId, { direction: objective.direction, atomic: objective.atomic }] as const;
      }));
      const selected = submissions.length === 0 ? [] : await db.query.cobiaIntents.findMany();
      const selectedIds = new Set(selected.flatMap((intent) => {
        const selectedSubmissionId = projectSelectedSubmissionId(intent, submissions);
        return selectedSubmissionId ? [selectedSubmissionId] : [];
      }));
      const projected = submissions.map((submission) => ({
        ...submission,
        presentationState: projectSubmissionState(submission, observedAtSec),
      }));
      const runs = await db.query.cobiaSolverRuns.findMany({
        where: eq(cobiaSolverRuns.solverId, id),
      });
      const performance = projectSolverPerformance({
        solverId: id, observedAtSec, runs,
        submissions: submissions.map((submission) => ({
          ...submission, objective: objectives.get(submission.id) ?? null,
        })),
        intents: selected,
      });
      return {
        ...profile,
        submissions: projected,
        stats: {
          accepted: submissions.filter(({ state }) =>
            ["verified", "attested", "superseded", "executed"].includes(state)).length,
          rejected: submissions.filter(({ state }) => state === "rejected").length,
          wins: submissions.filter(({ id: submissionId }) => selectedIds.has(submissionId)).length,
          current: projected.filter(({ presentationState }) => presentationState === "current").length,
        },
        performance,
      };
    },

    identity(id: string) {
      return db.query.cobiaSolvers.findFirst({ where: eq(cobiaSolvers.id, id) });
    },

    async supportsCapability(capability: string, observedAtSec: number) {
      const rows = await db.query.cobiaSolvers.findMany({
        columns: { declaredCapabilities: true, updatedAt: true },
      });
      return solverCapabilityAvailable(rows, capability, observedAtSec);
    },

    async list(observedAtSec: number) {
      const rows = await db.query.cobiaSolvers.findMany({ orderBy: [asc(cobiaSolvers.id)] });
      return Promise.all(rows.map(({ id }) => repository.read(id, observedAtSec)));
    },
  };
  return repository;
}
