import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaSolverSuccessFees } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);
const AuthorizationSchema = z.object({
  submissionId: z.string().uuid(), solverId: z.string().min(1),
  owner: AddressSchema, recipient: AddressSchema, amountAtomic: z.string().regex(/^[1-9][0-9]*$/),
  termsHash: HashSchema, terms: z.unknown(), credentialHash: HashSchema,
  credential: z.unknown(), expiresAtSec: z.number().int().positive().safe(),
}).strict();

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

export function createSolverSuccessFeeRepository(db: CobiaDatabase) {
  return {
    async authorize(value: z.input<typeof AuthorizationSchema>) {
      const input = AuthorizationSchema.parse(value);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaSolverSuccessFees.findFirst({
          where: eq(cobiaSolverSuccessFees.submissionId, input.submissionId),
        });
        if (stored) {
          if (stored.credentialHash !== input.credentialHash || stored.termsHash !== input.termsHash) {
            throw new Error("Solver success fee authorization conflicts");
          }
          return stored;
        }
        const { expiresAtSec, ...storedInput } = input;
        return required((await tx.insert(cobiaSolverSuccessFees).values({
          ...storedInput,
          owner: input.owner as `0x${string}`,
          recipient: input.recipient as `0x${string}`,
          termsHash: input.termsHash as `0x${string}`,
          credentialHash: input.credentialHash as `0x${string}`,
          expiresAt: new Date(expiresAtSec * 1_000),
        }).returning())[0], "Solver success fee authorization was not stored");
      });
    },

    get(submissionId: string) {
      return db.query.cobiaSolverSuccessFees.findFirst({
        where: eq(cobiaSolverSuccessFees.submissionId, z.string().uuid().parse(submissionId)),
      });
    },

    async claimSettlement(submissionId: string, nowSec: number) {
      return db.transaction(async (tx) => {
        const row = required((await tx.select().from(cobiaSolverSuccessFees)
          .where(eq(cobiaSolverSuccessFees.submissionId, z.string().uuid().parse(submissionId)))
          .for("update"))[0], "Solver success fee authorization is unavailable");
        if (row.state === "settled") return row;
        if (row.expiresAt.getTime() <= nowSec * 1_000) {
          return required((await tx.update(cobiaSolverSuccessFees).set({ state: "expired" })
            .where(and(eq(cobiaSolverSuccessFees.submissionId, row.submissionId),
              eq(cobiaSolverSuccessFees.state, "authorized"))).returning())[0],
          "Expired solver fee changed concurrently");
        }
        if (row.state !== "authorized") throw new Error("Solver success fee requires reconciliation");
        return required((await tx.update(cobiaSolverSuccessFees).set({ state: "settling" })
          .where(and(eq(cobiaSolverSuccessFees.submissionId, row.submissionId),
            eq(cobiaSolverSuccessFees.state, "authorized"))).returning())[0],
        "Solver success fee changed concurrently");
      });
    },

    async settle(submissionId: string, settlement: unknown) {
      return required((await db.update(cobiaSolverSuccessFees).set({
        state: "settled", settlement, settledAt: new Date(), errorCode: null,
      }).where(and(eq(cobiaSolverSuccessFees.submissionId, z.string().uuid().parse(submissionId)),
        eq(cobiaSolverSuccessFees.state, "settling"))).returning())[0],
      "Solver success fee was not settling");
    },

    async markUncertain(submissionId: string, errorCode: string) {
      return required((await db.update(cobiaSolverSuccessFees).set({
        state: "uncertain", errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/).parse(errorCode),
      }).where(and(eq(cobiaSolverSuccessFees.submissionId, z.string().uuid().parse(submissionId)),
        eq(cobiaSolverSuccessFees.state, "settling"))).returning())[0],
      "Solver success fee was not settling");
    },
  };
}
