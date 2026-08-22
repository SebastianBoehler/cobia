import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaSolverRuns, cobiaSolvers } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as `0x${string}`);
const CreateSchema = z.object({
  intentId: z.string().uuid(),
  solverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  revision: z.number().int().min(1).max(20),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
}).strict();
const IdSchema = z.string().uuid();
const FailureCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

function required<T>(rows: T[], message: string): T {
  const value = rows[0];
  if (!value) throw new Error(message);
  return value;
}

function sameRun(stored: typeof cobiaSolverRuns.$inferSelect, input: z.infer<typeof CreateSchema>) {
  return stored.intentId === input.intentId && stored.solverId === input.solverId &&
    stored.revision === input.revision && stored.blockNumber === input.blockNumber &&
    stored.blockHash === input.blockHash;
}

export function createSolverRunRepository(db: CobiaDatabase) {
  async function finish(
    idValue: string,
    state: "completed" | "abstained" | "failed",
    failureCode: string | null,
  ) {
    const id = IdSchema.parse(idValue);
    return db.transaction(async (tx) => {
      const run = required(await tx.select().from(cobiaSolverRuns)
        .where(eq(cobiaSolverRuns.id, id)).for("update"), "Solver run is unavailable");
      if (run.state === state && run.failureCode === failureCode) return run;
      if (run.state !== "running") throw new Error("Solver run is already resolved");
      const completedAt = new Date();
      return required(await tx.update(cobiaSolverRuns).set({
        state, failureCode, completedAt, updatedAt: completedAt,
      }).where(eq(cobiaSolverRuns.id, id)).returning(), "Solver run was not resolved");
    });
  }

  return {
    async listForIntent(intentIdValue: string) {
      const intentId = z.string().uuid().parse(intentIdValue);
      return await db.select({
        solverId: cobiaSolverRuns.solverId,
        displayName: cobiaSolvers.displayName,
        revision: cobiaSolverRuns.revision,
        state: cobiaSolverRuns.state,
        failureCode: cobiaSolverRuns.failureCode,
        updatedAt: cobiaSolverRuns.updatedAt,
      }).from(cobiaSolverRuns)
        .innerJoin(cobiaSolvers, eq(cobiaSolverRuns.solverId, cobiaSolvers.id))
        .where(eq(cobiaSolverRuns.intentId, intentId))
        .orderBy(asc(cobiaSolverRuns.createdAt));
    },

    async create(value: z.input<typeof CreateSchema>) {
      const input = CreateSchema.parse(value);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaSolverRuns.findFirst({
          where: and(eq(cobiaSolverRuns.intentId, input.intentId),
            eq(cobiaSolverRuns.solverId, input.solverId),
            eq(cobiaSolverRuns.revision, input.revision)),
        });
        if (stored) {
          if (!sameRun(stored, input)) throw new Error("Solver run conflicts");
          return stored;
        }
        return required(await tx.insert(cobiaSolverRuns).values(input).returning(),
          "Solver run was not stored");
      });
    },

    async start(idValue: string) {
      const id = IdSchema.parse(idValue);
      return db.transaction(async (tx) => {
        const run = required(await tx.select().from(cobiaSolverRuns)
          .where(eq(cobiaSolverRuns.id, id)).for("update"), "Solver run is unavailable");
        if (run.state === "running") return run;
        if (run.state !== "queued") throw new Error("Solver run is already resolved");
        return required(await tx.update(cobiaSolverRuns).set({
          state: "running", updatedAt: new Date(),
        }).where(eq(cobiaSolverRuns.id, id)).returning(), "Solver run was not started");
      });
    },

    complete: (id: string) => finish(id, "completed", null),
    abstain: (id: string) => finish(id, "abstained", null),
    fail: (id: string, code: string) => finish(id, "failed", FailureCodeSchema.parse(code)),

    async readBrokerAnchor(idValue: string) {
      const id = IdSchema.parse(idValue);
      return await db.query.cobiaSolverRuns.findFirst({
        columns: { state: true, blockNumber: true },
        where: eq(cobiaSolverRuns.id, id),
      }) ?? null;
    },
  };
}
