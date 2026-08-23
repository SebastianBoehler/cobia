import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { WalletAuthRepository } from "../wallet-auth/service";
import type { CobiaDatabase } from "./client";
import {
  cobiaIntentCompileAttempts, cobiaWalletAuthChallenges, cobiaWalletAuthSessions,
} from "./schema";

const OWNER_LIMIT_PER_MINUTE = 5;
const CLIENT_LIMIT_PER_MINUTE = 20;
const CACHE_LIFETIME_SEC = 5 * 60;
const LEASE_LIFETIME_SEC = 90;

function date(seconds: number) {
  return new Date(seconds * 1_000);
}

function first<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function createWalletAuthRepository(db: CobiaDatabase): WalletAuthRepository {
  return {
    async createChallenge(value) {
      await db.insert(cobiaWalletAuthChallenges).values({
        ...value, expiresAt: date(value.expiresAt),
      });
    },

    async readChallenge({ nonceHash, owner, nowSec }) {
      const row = await db.query.cobiaWalletAuthChallenges.findFirst({
        where: and(eq(cobiaWalletAuthChallenges.nonceHash, nonceHash),
          eq(cobiaWalletAuthChallenges.owner, owner), isNull(cobiaWalletAuthChallenges.consumedAt),
          gt(cobiaWalletAuthChallenges.expiresAt, date(nowSec))),
      });
      return row ? { owner: row.owner, message: row.message,
        expiresAt: Math.floor(row.expiresAt.getTime() / 1_000) } : null;
    },

    async consumeChallenge({ nonceHash, owner, nowSec }) {
      const rows = await db.update(cobiaWalletAuthChallenges).set({ consumedAt: sql`now()` })
        .where(and(eq(cobiaWalletAuthChallenges.nonceHash, nonceHash),
          eq(cobiaWalletAuthChallenges.owner, owner), isNull(cobiaWalletAuthChallenges.consumedAt),
          gt(cobiaWalletAuthChallenges.expiresAt, date(nowSec)))).returning();
      const row = first(rows);
      return row ? { owner: row.owner, message: row.message,
        expiresAt: Math.floor(row.expiresAt.getTime() / 1_000) } : null;
    },

    async createSession(value) {
      await db.insert(cobiaWalletAuthSessions).values({
        ...value, expiresAt: date(value.expiresAt),
      });
    },

    async readSession({ tokenHash, nowSec }) {
      const row = await db.query.cobiaWalletAuthSessions.findFirst({
        where: and(eq(cobiaWalletAuthSessions.tokenHash, tokenHash),
          gt(cobiaWalletAuthSessions.expiresAt, date(nowSec))),
      });
      return row ? { owner: row.owner, expiresAt: Math.floor(row.expiresAt.getTime() / 1_000) } : null;
    },

    async beginCompilation(input) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet:${input.owner}`}, 0))`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`client:${input.clientKey}`}, 0))`);
        const completedAfter = date(input.nowSec - CACHE_LIFETIME_SEC);
        const cached = await tx.query.cobiaIntentCompileAttempts.findFirst({
          where: and(eq(cobiaIntentCompileAttempts.owner, input.owner),
            eq(cobiaIntentCompileAttempts.goalHash, input.goalHash),
            eq(cobiaIntentCompileAttempts.actionPreference, input.actionPreference),
            eq(cobiaIntentCompileAttempts.state, "completed"),
            gt(cobiaIntentCompileAttempts.completedAt, completedAfter)),
          orderBy: [desc(cobiaIntentCompileAttempts.completedAt)],
        });
        if (cached?.result !== null && cached?.result !== undefined) {
          return { kind: "cached" as const, result: cached.result };
        }
        const active = await tx.query.cobiaIntentCompileAttempts.findFirst({
          where: and(eq(cobiaIntentCompileAttempts.owner, input.owner),
            eq(cobiaIntentCompileAttempts.state, "pending"),
            gt(cobiaIntentCompileAttempts.expiresAt, date(input.nowSec))),
        });
        if (active) return { kind: "busy" as const };
        const windowStart = date(input.nowSec - 60);
        const [ownerCount, clientCount] = await Promise.all([
          tx.select({ value: count() }).from(cobiaIntentCompileAttempts).where(and(
            eq(cobiaIntentCompileAttempts.owner, input.owner),
            gt(cobiaIntentCompileAttempts.createdAt, windowStart))),
          tx.select({ value: count() }).from(cobiaIntentCompileAttempts).where(and(
            eq(cobiaIntentCompileAttempts.clientKey, input.clientKey),
            gt(cobiaIntentCompileAttempts.createdAt, windowStart))),
        ]);
        if ((ownerCount[0]?.value ?? 0) >= OWNER_LIMIT_PER_MINUTE ||
          (clientCount[0]?.value ?? 0) >= CLIENT_LIMIT_PER_MINUTE) return { kind: "limited" as const };
        const row = first(await tx.insert(cobiaIntentCompileAttempts).values({
          owner: input.owner, clientKey: input.clientKey, goalHash: input.goalHash,
          actionPreference: input.actionPreference, expiresAt: date(input.nowSec + LEASE_LIFETIME_SEC),
          createdAt: date(input.nowSec),
        }).returning({ id: cobiaIntentCompileAttempts.id }));
        if (!row) throw new Error("Intent compilation lease was not stored");
        return { kind: "run" as const, id: row.id };
      });
    },

    async completeCompilation(id, result, nowSec) {
      const rows = await db.update(cobiaIntentCompileAttempts).set({
        state: "completed", result, completedAt: date(nowSec),
      }).where(and(eq(cobiaIntentCompileAttempts.id, id),
        eq(cobiaIntentCompileAttempts.state, "pending"))).returning({ id: cobiaIntentCompileAttempts.id });
      if (!rows[0]) throw new Error("Intent compilation lease is unavailable");
    },

    async failCompilation(id, nowSec) {
      await db.update(cobiaIntentCompileAttempts).set({ state: "failed", completedAt: date(nowSec) })
        .where(and(eq(cobiaIntentCompileAttempts.id, id), eq(cobiaIntentCompileAttempts.state, "pending")));
    },

    async readCompletedCompilation({ id, owner, nowSec }) {
      const row = await db.query.cobiaIntentCompileAttempts.findFirst({
        where: and(eq(cobiaIntentCompileAttempts.id, id), eq(cobiaIntentCompileAttempts.owner, owner),
          eq(cobiaIntentCompileAttempts.state, "completed"),
          gt(cobiaIntentCompileAttempts.completedAt, date(nowSec - CACHE_LIFETIME_SEC))),
      });
      return row?.result ?? null;
    },
  };
}
