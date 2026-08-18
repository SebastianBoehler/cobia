import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaChallengeRounds, cobiaChallenges } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase());
const TemplateSchema = z.object({
  version: z.literal(1),
  capabilityTemplateId: z.enum(["aave-supply", "exact-input-swap", "round-trip"]),
  parameters: z.record(z.string(), z.string()),
}).strict();
const CreateSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  displayGoal: z.string().trim().min(1).max(500),
  policyTemplate: TemplateSchema,
  manifestHash: HashSchema,
}).strict();
const RoundSchema = z.object({
  id: z.string().uuid(), challengeId: z.string(),
  opensAtSec: z.number().int().positive().safe(),
  closesAtSec: z.number().int().positive().safe(),
  anchorBlockNumber: z.string().regex(/^[1-9][0-9]*$/),
  anchorBlockHash: HashSchema,
}).strict().refine((value) => value.closesAtSec > value.opensAtSec &&
  value.closesAtSec - value.opensAtSec <= 3_600, { message: "Challenge round must be bounded" });

function sameChallenge(stored: typeof cobiaChallenges.$inferSelect, input: z.infer<typeof CreateSchema>) {
  return stored.title === input.title && stored.displayGoal === input.displayGoal &&
    stored.manifestHash === input.manifestHash &&
    JSON.stringify(stored.policyTemplate) === JSON.stringify(input.policyTemplate);
}

export function createChallengeRepository(db: CobiaDatabase) {
  return {
    async create(value: z.input<typeof CreateSchema>) {
      const input = CreateSchema.parse(value);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaChallenges.findFirst({
          where: eq(cobiaChallenges.id, input.id),
        });
        if (stored) {
          if (!sameChallenge(stored, input)) throw new Error("Standing challenge conflicts");
          return stored;
        }
        const rows = await tx.insert(cobiaChallenges).values({
          ...input,
          chainId: 196,
          manifestHash: input.manifestHash as `0x${string}`,
        }).returning();
        if (!rows[0]) throw new Error("Standing challenge was not stored");
        return rows[0];
      });
    },

    async openRound(value: z.input<typeof RoundSchema>) {
      const input = RoundSchema.parse(value);
      return db.transaction(async (tx) => {
        const challenge = await tx.query.cobiaChallenges.findFirst({
          where: eq(cobiaChallenges.id, input.challengeId),
        });
        if (!challenge || challenge.status !== "active") throw new Error("Standing challenge is not active");
        const existing = await tx.query.cobiaChallengeRounds.findFirst({
          where: eq(cobiaChallengeRounds.id, input.id),
        });
        if (existing) return existing;
        const rows = await tx.insert(cobiaChallengeRounds).values({
          id: input.id, challengeId: input.challengeId,
          opensAt: new Date(input.opensAtSec * 1_000), closesAt: new Date(input.closesAtSec * 1_000),
          anchorBlockNumber: input.anchorBlockNumber,
          anchorBlockHash: input.anchorBlockHash as `0x${string}`,
        }).returning();
        if (!rows[0]) throw new Error("Challenge round was not stored");
        return rows[0];
      });
    },

    async listDiscover(observedAtSec: number) {
      const observedAt = new Date(observedAtSec * 1_000);
      const challenges = await db.query.cobiaChallenges.findMany({
        where: eq(cobiaChallenges.status, "active"),
      });
      return Promise.all(challenges.map(async (challenge) => {
        const latest = await db.query.cobiaChallengeRounds.findFirst({
          where: eq(cobiaChallengeRounds.challengeId, challenge.id),
          orderBy: [desc(cobiaChallengeRounds.opensAt)],
        });
        const current = await db.query.cobiaChallengeRounds.findFirst({
          where: and(eq(cobiaChallengeRounds.challengeId, challenge.id),
            lte(cobiaChallengeRounds.opensAt, observedAt)),
          orderBy: [desc(cobiaChallengeRounds.opensAt)],
        });
        const currentRound = current && current.closesAt > observedAt ? current : null;
        return {
          ...challenge,
          availability: currentRound ? "live" as const : "between-rounds" as const,
          currentRound,
          latestRound: latest ?? null,
        };
      }));
    },
  };
}
