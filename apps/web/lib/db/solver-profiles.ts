import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { projectSubmissionState } from "../competitions/submission-state";
import type { CobiaDatabase } from "./client";
import { cobiaIntents, cobiaSolverSubmissions, cobiaSolvers } from "./schema";

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

function sameProfile(stored: typeof cobiaSolvers.$inferSelect, input: z.infer<typeof ProfileSchema>) {
  return stored.displayName === input.displayName && stored.operatorKind === input.operatorKind &&
    stored.attestationAddress === input.attestationAddress &&
    JSON.stringify(stored.declaredCapabilities) === JSON.stringify(input.declaredCapabilities);
}

export function createSolverProfileRepository(db: CobiaDatabase) {
  const repository = {
    async register(value: z.input<typeof ProfileSchema>) {
      const input = ProfileSchema.parse(value);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaSolvers.findFirst({ where: eq(cobiaSolvers.id, input.id) });
        if (stored) {
          if (!sameProfile(stored, input)) throw new Error("Solver profile conflicts");
          return stored;
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
        orderBy: [asc(cobiaSolverSubmissions.createdAt)],
      });
      const selected = submissions.length === 0 ? [] : await db.query.cobiaIntents.findMany();
      const selectedIds = new Set(selected.flatMap(({ selectedSubmissionId }) =>
        selectedSubmissionId ? [selectedSubmissionId] : []));
      const projected = submissions.map((submission) => ({
        ...submission,
        presentationState: projectSubmissionState(submission, observedAtSec),
      }));
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
      };
    },

    async list(observedAtSec: number) {
      const rows = await db.query.cobiaSolvers.findMany({ orderBy: [asc(cobiaSolvers.id)] });
      return Promise.all(rows.map(({ id }) => repository.read(id, observedAtSec)));
    },
  };
  return repository;
}
