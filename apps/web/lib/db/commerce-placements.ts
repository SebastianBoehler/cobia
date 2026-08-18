import { isAddress, type Address, type Hash } from "viem";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaCommercePlacementEvents, cobiaCommercePlacements } from "./schema";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const PrepareSchema = z.object({
  id: z.string().uuid(), owner: AddressSchema, offerCommitment: HashSchema,
  policyHash: HashSchema, programHash: HashSchema, manifestHash: HashSchema,
  planHash: HashSchema, authorizationTemplateHash: HashSchema,
  observedAtSec: z.number().int().positive().safe(),
}).strict();
const AppendBaseSchema = z.object({
  placementId: z.string().uuid(), owner: AddressSchema,
  observedAtSec: z.number().int().positive().safe(),
});
const AppendSchema = z.discriminatedUnion("state", [
  AppendBaseSchema.extend({
    expectedState: z.literal("prepared"), state: z.literal("authorizing"),
    authorizationHash: HashSchema,
  }).strict(),
  AppendBaseSchema.extend({
    expectedState: z.literal("authorizing"), state: z.literal("submitted"),
    authorizationHash: HashSchema, transactionHash: HashSchema,
  }).strict(),
  AppendBaseSchema.extend({
    expectedState: z.literal("submitted"), state: z.literal("confirmed"),
    authorizationHash: HashSchema, transactionHash: HashSchema, evidenceHash: HashSchema,
  }).strict(),
  AppendBaseSchema.extend({
    expectedState: z.enum(["prepared", "authorizing", "submitted", "confirmed", "rejected"]),
    state: z.literal("rejected"),
    rejectionCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  }).strict(),
]);

type EventRow = typeof cobiaCommercePlacementEvents.$inferSelect;

function project(root: typeof cobiaCommercePlacements.$inferSelect, events: EventRow[]) {
  const latest = events.at(-1);
  if (!latest) throw new Error("Commerce placement has no state event");
  const find = <K extends "authorizationHash" | "transactionHash" | "evidenceHash" | "rejectionCode">(key: K) =>
    events.findLast((event) => event[key] !== null)?.[key] ?? null;
  return {
    ...root, state: latest.state, sequence: latest.sequence,
    authorizationHash: find("authorizationHash"), transactionHash: find("transactionHash"),
    evidenceHash: find("evidenceHash"), rejectionCode: find("rejectionCode"),
    updatedAt: latest.createdAt,
  };
}

function sameRoot(row: typeof cobiaCommercePlacements.$inferSelect, input: z.infer<typeof PrepareSchema>) {
  return row.owner === input.owner && row.offerCommitment === input.offerCommitment &&
    row.policyHash === input.policyHash && row.programHash === input.programHash &&
    row.manifestHash === input.manifestHash && row.planHash === input.planHash &&
    row.authorizationTemplateHash === input.authorizationTemplateHash &&
    row.createdAt.getTime() === input.observedAtSec * 1_000;
}

export function createCommercePlacementRepository(db: CobiaDatabase) {
  const repository = {
    async read(idValue: string) {
      const id = z.string().uuid().parse(idValue);
      const root = await db.query.cobiaCommercePlacements.findFirst({
        where: eq(cobiaCommercePlacements.id, id),
      });
      if (!root) return null;
      const events = await db.query.cobiaCommercePlacementEvents.findMany({
        where: eq(cobiaCommercePlacementEvents.placementId, id),
        orderBy: [asc(cobiaCommercePlacementEvents.sequence)],
      });
      return project(root, events);
    },

    async prepare(value: z.input<typeof PrepareSchema>) {
      const input = PrepareSchema.parse(value);
      const createdAt = new Date(input.observedAtSec * 1_000);
      const inserted = await db.transaction(async (tx) => {
        const rows = await tx.insert(cobiaCommercePlacements).values({
          id: input.id, owner: input.owner, offerCommitment: input.offerCommitment,
          policyHash: input.policyHash, programHash: input.programHash,
          manifestHash: input.manifestHash, planHash: input.planHash,
          authorizationTemplateHash: input.authorizationTemplateHash, createdAt,
        })
          .onConflictDoNothing({ target: cobiaCommercePlacements.id }).returning();
        if (!rows[0]) return false;
        await tx.insert(cobiaCommercePlacementEvents).values({
          placementId: input.id, sequence: 1, state: "prepared", createdAt,
        });
        return true;
      });
      const stored = await repository.read(input.id);
      if (!stored) throw new Error("Commerce placement was not prepared");
      if (!inserted && !sameRoot(stored, input)) throw new Error("Commerce placement conflicts");
      return stored;
    },

    async append(value: z.input<typeof AppendSchema>) {
      const input = AppendSchema.parse(value);
      return db.transaction(async (tx) => {
        const root = (await tx.select().from(cobiaCommercePlacements)
          .where(eq(cobiaCommercePlacements.id, input.placementId)).for("update"))[0];
        if (!root) throw new Error("Commerce placement is unavailable");
        if (root.owner !== input.owner) throw new Error("Commerce placement owner mismatch");
        const events = await tx.query.cobiaCommercePlacementEvents.findMany({
          where: eq(cobiaCommercePlacementEvents.placementId, input.placementId),
          orderBy: [asc(cobiaCommercePlacementEvents.sequence)],
        });
        const current = project(root, events);
        if (current.state !== input.expectedState || ["confirmed", "rejected"].includes(current.state)) {
          throw new Error("Invalid commerce placement transition");
        }
        if (input.observedAtSec * 1_000 <= current.updatedAt.getTime()) {
          throw new Error("Commerce placement event time must increase");
        }
        if ("authorizationHash" in input && current.authorizationHash &&
          input.authorizationHash !== current.authorizationHash) {
          throw new Error("Commerce authorization hash mismatch");
        }
        if ("transactionHash" in input && current.transactionHash &&
          input.transactionHash !== current.transactionHash) {
          throw new Error("Commerce transaction hash mismatch");
        }
        const event: EventRow = {
          id: 0,
          placementId: input.placementId, sequence: current.sequence + 1, state: input.state,
          createdAt: new Date(input.observedAtSec * 1_000),
          authorizationHash: input.state === "authorizing" ? input.authorizationHash : null,
          transactionHash: input.state === "submitted" ? input.transactionHash : null,
          evidenceHash: input.state === "confirmed" ? input.evidenceHash : null,
          rejectionCode: input.state === "rejected" ? input.rejectionCode : null,
        };
        await tx.insert(cobiaCommercePlacementEvents).values({
          placementId: event.placementId, sequence: event.sequence, state: event.state,
          authorizationHash: event.authorizationHash, transactionHash: event.transactionHash,
          evidenceHash: event.evidenceHash, rejectionCode: event.rejectionCode,
          createdAt: event.createdAt,
        });
        return project(root, [...events, event]);
      });
    },
  };
  return repository;
}
