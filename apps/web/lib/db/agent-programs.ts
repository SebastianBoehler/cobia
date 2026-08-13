import { commitment } from "@cobia/domain";
import { and, asc, eq } from "drizzle-orm";
import { getAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaAgentArtifacts, cobiaAgentPrograms, cobiaRequests } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const CreateSchema = z.object({
  requestId: z.string().uuid(),
  owner: z.string().transform((value) => getAddress(value).toLowerCase() as Address),
  policyHash: HashSchema,
  snapshotHash: HashSchema,
  manifestHash: HashSchema,
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
}).strict();
const KindSchema = z.enum([
  "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
  "receipt",
]);
const VERIFIED_KINDS = new Set([
  "program", "evidence", "provenance", "verdict", "replay", "execution",
]);

function jsonArtifact(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonArtifact);
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error("Agent artifacts must use plain JSON objects");
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonArtifact(entry)]));
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value))) return value;
  throw new Error("Agent artifact is not canonical JSON");
}

function row<T>(rows: T[], message: string): T {
  const value = rows[0];
  if (!value) throw new Error(message);
  return value;
}

function sameCreate(stored: typeof cobiaAgentPrograms.$inferSelect, input: z.infer<typeof CreateSchema>) {
  return stored.requestId === input.requestId && stored.owner === input.owner &&
    stored.policyHash === input.policyHash && stored.snapshotHash === input.snapshotHash &&
    stored.manifestHash === input.manifestHash && stored.blockNumber === input.blockNumber &&
    stored.blockHash === input.blockHash && stored.chainId === 196;
}

export function createAgentProgramRepository(db: CobiaDatabase) {
  return {
    async create(inputValue: z.input<typeof CreateSchema>) {
      const input = CreateSchema.parse(inputValue);
      return db.transaction(async (tx) => {
        const existing = await tx.query.cobiaAgentPrograms.findFirst({
          where: eq(cobiaAgentPrograms.requestId, input.requestId),
        });
        if (existing) {
          if (!sameCreate(existing, input)) throw new Error("Agent program job conflicts");
          return existing;
        }
        return row(await tx.insert(cobiaAgentPrograms).values({
          ...input, chainId: 196,
        }).returning(), "Agent program job was not stored");
      });
    },

    async start(id: string) {
      return db.transaction(async (tx) => {
        const job = row(await tx.select().from(cobiaAgentPrograms)
          .where(eq(cobiaAgentPrograms.id, id)).for("update"), "Agent program job is unavailable");
        if (job.state === "running") return job;
        if (job.state !== "queued") throw new Error("Agent program job is already resolved");
        return row(await tx.update(cobiaAgentPrograms).set({
          state: "running", updatedAt: new Date(),
        }).where(eq(cobiaAgentPrograms.id, id)).returning(), "Agent program job was not started");
      });
    },

    async append(id: string, kindValue: z.input<typeof KindSchema>, payload: unknown) {
      const kind = KindSchema.parse(kindValue);
      const canonicalPayload = jsonArtifact(payload);
      const artifactHash = commitment(canonicalPayload);
      return db.transaction(async (tx) => {
        const job = row(await tx.select().from(cobiaAgentPrograms)
          .where(eq(cobiaAgentPrograms.id, id)).for("update"), "Agent program job is unavailable");
        const existing = await tx.query.cobiaAgentArtifacts.findFirst({
          where: and(eq(cobiaAgentArtifacts.programId, id), eq(cobiaAgentArtifacts.kind, kind)),
        });
        if (existing) {
          if (existing.artifactHash !== artifactHash) throw new Error("Agent artifact conflicts");
          return existing;
        }
        const allowed = job.state === "running" || (job.state === "verified" && kind === "authorization") ||
          (job.state === "attested" && kind === "receipt");
        if (!allowed) throw new Error("Agent program job cannot accept this artifact");
        return row(await tx.insert(cobiaAgentArtifacts).values({
          programId: id, kind, artifactHash, payload: canonicalPayload,
        }).returning(), "Agent artifact was not stored");
      });
    },

    async markVerified(id: string) {
      return db.transaction(async (tx) => {
        const job = row(await tx.select().from(cobiaAgentPrograms)
          .where(eq(cobiaAgentPrograms.id, id)).for("update"), "Agent program job is unavailable");
        if (job.state === "verified") return job;
        if (job.state !== "running") throw new Error("Agent program job must be running");
        const artifacts = await tx.query.cobiaAgentArtifacts.findMany({
          where: eq(cobiaAgentArtifacts.programId, id),
        });
        const kinds = new Set(artifacts.map(({ kind }) => kind));
        if (![...VERIFIED_KINDS].every((kind) => kinds.has(kind as never))) {
          throw new Error("Agent verification artifacts are incomplete");
        }
        return row(await tx.update(cobiaAgentPrograms).set({
          state: "verified", updatedAt: new Date(),
        }).where(eq(cobiaAgentPrograms.id, id)).returning(), "Agent program was not verified");
      });
    },

    async markAttested(id: string) {
      return db.transaction(async (tx) => {
        const job = row(await tx.select().from(cobiaAgentPrograms)
          .where(eq(cobiaAgentPrograms.id, id)).for("update"), "Agent program job is unavailable");
        if (job.state === "attested") return job;
        if (job.state !== "verified") throw new Error("Agent program job must be verified");
        const authorization = await tx.query.cobiaAgentArtifacts.findFirst({
          where: and(
            eq(cobiaAgentArtifacts.programId, id),
            eq(cobiaAgentArtifacts.kind, "authorization"),
          ),
        });
        if (!authorization) throw new Error("Agent authorization artifact is missing");
        const completedAt = new Date();
        return row(await tx.update(cobiaAgentPrograms).set({
          state: "attested", completedAt, updatedAt: completedAt,
        }).where(eq(cobiaAgentPrograms.id, id)).returning(), "Agent program was not attested");
      });
    },

    reject: (id: string, code: string) => resolve(db, id, "rejected", code),
    fail: (id: string, code: string) => resolve(db, id, "failed", code),

    async get(id: string) {
      const job = await db.query.cobiaAgentPrograms.findFirst({
        where: eq(cobiaAgentPrograms.id, id),
      });
      if (!job) return null;
      const artifacts = await db.query.cobiaAgentArtifacts.findMany({
        where: eq(cobiaAgentArtifacts.programId, id),
        orderBy: [asc(cobiaAgentArtifacts.id)],
      });
      return { ...job, artifacts };
    },

    async getBrokerAnchor(id: string) {
      return await db.query.cobiaAgentPrograms.findFirst({
        columns: { state: true, blockNumber: true },
        where: eq(cobiaAgentPrograms.id, id),
      }) ?? null;
    },

    async getByRequestId(requestId: string) {
      return await db.query.cobiaAgentPrograms.findFirst({
        where: eq(cobiaAgentPrograms.requestId, requestId),
      }) ?? null;
    },

    async getExecutionContext(id: string) {
      const job = await db.query.cobiaAgentPrograms.findFirst({
        where: eq(cobiaAgentPrograms.id, id),
      });
      if (!job) return null;
      const request = await db.query.cobiaRequests.findFirst({
        columns: { policy: true, snapshot: true },
        where: eq(cobiaRequests.id, job.requestId),
      });
      if (!request?.snapshot) throw new Error("Agent program request context is unavailable");
      const artifacts = await db.query.cobiaAgentArtifacts.findMany({
        where: eq(cobiaAgentArtifacts.programId, id),
        orderBy: [asc(cobiaAgentArtifacts.id)],
      });
      return { ...job, policy: request.policy, snapshot: request.snapshot, artifacts };
    },
  };
}

async function resolve(
  db: CobiaDatabase,
  id: string,
  state: "rejected" | "failed",
  failureCode: string,
) {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(failureCode)) throw new Error("Invalid failure code");
  return db.transaction(async (tx) => {
    const job = row(await tx.select().from(cobiaAgentPrograms)
      .where(eq(cobiaAgentPrograms.id, id)).for("update"), "Agent program job is unavailable");
    if (job.state === state && job.failureCode === failureCode) return job;
    const canResolve = job.state === "queued" || job.state === "running" ||
      (state === "failed" && job.state === "verified");
    if (!canResolve) {
      throw new Error("Agent program job is already resolved");
    }
    const completedAt = new Date();
    return row(await tx.update(cobiaAgentPrograms).set({
      state, failureCode, completedAt, updatedAt: completedAt,
    }).where(eq(cobiaAgentPrograms.id, id)).returning(), "Agent program job was not resolved");
  });
}
