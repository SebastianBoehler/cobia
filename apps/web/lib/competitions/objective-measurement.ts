import { z } from "zod";

const AtomicObjectiveV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("atomic-value"),
  direction: z.enum(["maximize", "minimize"]),
  atomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
}).strict();

export const CompositionObjectiveV2Schema = z.object({
  version: z.literal(2),
  kind: z.literal("composition-net-yield-usd-e8"),
  direction: z.literal("maximize"),
  atomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  horizonDays: z.number().int().min(1).max(365),
  evaluator: z.literal("composition-net-yield@1"),
  evidenceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
}).strict();

export const ObjectiveMeasurementV1Schema = z.discriminatedUnion("version", [
  AtomicObjectiveV1Schema,
  CompositionObjectiveV2Schema,
]);

export type ObjectiveMeasurementV1 = z.infer<typeof ObjectiveMeasurementV1Schema>;
