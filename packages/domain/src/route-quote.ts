import { z } from "zod";
import {
  AddressSchema,
  AtomicAmountSchema,
  HashSchema,
} from "./primitives";

export const RouteQuoteSchema = z
  .object({
    version: z.literal(1),
    quoteId: HashSchema,
    requestId: z.string().uuid(),
    solverId: z.string().min(1),
    solverAddress: AddressSchema,
    bundleHash: HashSchema,
    expectedNetApyBps: z.number().int().min(0),
    riskGrade: z.enum(["low", "moderate", "elevated"]),
    priceAtomic: AtomicAmountSchema,
    validUntil: z.number().int().positive(),
    verification: z
      .object({
        executable: z.boolean(),
        errorCodes: z.array(z.string()),
        score: z.number().int(),
      })
      .strict(),
  })
  .strict();

export type RouteQuote = z.infer<typeof RouteQuoteSchema>;
