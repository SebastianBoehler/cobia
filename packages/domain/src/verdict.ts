import { z } from "zod";
import { HashSchema } from "./primitives";

export const VerificationVerdictSchema = z
  .object({
    bundleHash: HashSchema,
    executable: z.boolean(),
    errorCodes: z.array(z.string()),
    recomputedNetApyBps: z.number().int().min(0),
    riskPenaltyBps: z.number().int().min(0),
    score: z.number().int(),
  })
  .strict();

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;
