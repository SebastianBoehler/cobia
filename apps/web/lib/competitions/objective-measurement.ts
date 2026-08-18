import { z } from "zod";

export const ObjectiveMeasurementV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("atomic-value"),
  direction: z.enum(["maximize", "minimize"]),
  atomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
}).strict();

export type ObjectiveMeasurementV1 = z.infer<typeof ObjectiveMeasurementV1Schema>;
