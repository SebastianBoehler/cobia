import {
  CapabilityCompositionPolicyV1Schema,
  GeneralIntentPolicyV2Schema,
  GeneralAssetPolicyV1Schema,
  OpenIntentPolicyV3Schema,
  commitment,
} from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema } from "@cobia/solvers";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaIntents, cobiaOpenIntentSnapshots, cobiaSolverSubmissions } from "./schema";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const CreateSchema = z.object({
  policy: z.union([
    GeneralIntentPolicyV2Schema,
    OpenIntentPolicyV3Schema,
    CapabilityCompositionPolicyV1Schema,
    GeneralAssetPolicyV1Schema,
  ]),
  ownerSignature: SignatureSchema,
  generalAssetEvidence: GeneralAssetEvidenceArtifactV1Schema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.policy.kind === "general-asset") !== Boolean(value.generalAssetEvidence)) {
    context.addIssue({ code: "custom", path: ["generalAssetEvidence"],
      message: "General asset evidence must match the intent kind" });
  }
});

export function createIntentRepository(db: CobiaDatabase) {
  return {
    async create(value: z.input<typeof CreateSchema>) {
      const { policy, ownerSignature, generalAssetEvidence } = CreateSchema.parse(value);
      const policyHash = commitment(policy);
      const generalAssetEvidenceHash = generalAssetEvidence
        ? commitment(generalAssetEvidence) as `0x${string}` : null;
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaIntents.findFirst({
          where: eq(cobiaIntents.id, policy.requestId),
        });
        if (stored) {
          if (stored.policyHash !== policyHash || stored.ownerSignature !== ownerSignature) {
            throw new Error("Signed intent conflicts");
          }
          if (stored.generalAssetEvidenceHash !== generalAssetEvidenceHash) {
            throw new Error("General asset intent evidence conflicts");
          }
          return stored;
        }
        const rows = await tx.insert(cobiaIntents).values({
          id: policy.requestId, owner: policy.owner,
          chainId: policy.kind === "general-asset" ? policy.sourceChainId : 196,
          displayGoal: policy.displayGoal,
          policyHash: policyHash as `0x${string}`,
          policy,
          ownerSignature: ownerSignature as `0x${string}`,
          generalAssetEvidenceHash,
          generalAssetEvidence: generalAssetEvidence ?? null,
          state: "collecting", competitionClosesAt: new Date(policy.competition.closesAt * 1_000),
        }).returning();
        if (!rows[0]) throw new Error("Signed intent was not stored");
        return rows[0];
      });
    },

    get: (id: string) => db.query.cobiaIntents.findFirst({ where: eq(cobiaIntents.id, id) }),

    listDiscover(observedAtSec: number) {
      return db.query.cobiaIntents.findMany({
        where: and(eq(cobiaIntents.state, "collecting"),
          gt(cobiaIntents.competitionClosesAt, new Date(observedAtSec * 1_000)),
          sql`${cobiaIntents.policy}->>'kind' IN ('open-onchain', 'capability-composition')`),
        orderBy: [desc(cobiaIntents.createdAt)],
        limit: 30,
      });
    },

    listDiscoverWithSnapshots(observedAtSec: number) {
      return db.select({
        intent: cobiaIntents,
        snapshot: cobiaOpenIntentSnapshots,
      }).from(cobiaIntents)
        .innerJoin(
          cobiaOpenIntentSnapshots,
          eq(cobiaOpenIntentSnapshots.intentId, cobiaIntents.id),
        )
        .where(and(
          eq(cobiaIntents.state, "collecting"),
          gt(cobiaIntents.competitionClosesAt, new Date(observedAtSec * 1_000)),
          sql`${cobiaIntents.policy}->>'kind' IN ('open-onchain', 'capability-composition')`,
        ))
        .orderBy(desc(cobiaIntents.createdAt))
        .limit(30);
    },

    listDiscoverGeneralAssets(observedAtSec: number) {
      return db.query.cobiaIntents.findMany({
        where: and(eq(cobiaIntents.state, "collecting"),
          gt(cobiaIntents.competitionClosesAt, new Date(observedAtSec * 1_000)),
          sql`${cobiaIntents.policy}->>'kind' = 'general-asset'`,
          sql`${cobiaIntents.generalAssetEvidence} IS NOT NULL`,
          sql`${cobiaIntents.generalAssetEvidenceHash} IS NOT NULL`),
        orderBy: [desc(cobiaIntents.createdAt)],
        limit: 30,
      });
    },

    async select(intentId: string, submissionId: string, observedAtSec: number) {
      return db.transaction(async (tx) => {
        const intent = (await tx.select().from(cobiaIntents)
          .where(eq(cobiaIntents.id, intentId)).for("update"))[0];
        if (!intent) throw new Error("Intent is unavailable");
        const submission = await tx.query.cobiaSolverSubmissions.findFirst({
          where: and(eq(cobiaSolverSubmissions.id, submissionId),
            eq(cobiaSolverSubmissions.intentId, intentId),
            eq(cobiaSolverSubmissions.state, "attested"),
            gt(cobiaSolverSubmissions.validUntil, new Date(observedAtSec * 1_000))),
        });
        if (!submission) throw new Error("Only a fresh attested submission can be selected");
        const rows = await tx.update(cobiaIntents).set({
          selectedSubmissionId: submissionId, state: "selected", updatedAt: new Date(),
        }).where(eq(cobiaIntents.id, intentId)).returning();
        if (!rows[0]) throw new Error("Intent selection was not stored");
        return rows[0];
      });
    },
  };
}
