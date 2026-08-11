import { z } from "zod";
import {
  AddressSchema,
  AtomicAmountSchema,
  HashSchema,
} from "./primitives";

const StoredRiskGradeSchema = z.enum([
  "unassessed",
  "low",
  "moderate",
  "elevated",
]);
type PublicRiskGrade = "unassessed" | "moderate" | "elevated";
const PublicRiskGradeSchema = StoredRiskGradeSchema.transform(
  (grade): PublicRiskGrade => grade === "low" ? "unassessed" : grade,
);

const RouteQuoteShape = {
  version: z.literal(1),
  quoteId: HashSchema,
  requestId: z.string().uuid(),
  solverId: z.string().min(1),
  solverAddress: AddressSchema,
  bundleHash: HashSchema,
  expectedNetApyBps: z.number().int().min(0),
  priceAtomic: AtomicAmountSchema,
  validUntil: z.number().int().positive(),
  verification: z
    .object({
      executable: z.boolean(),
      errorCodes: z.array(z.string()),
      score: z.number().int(),
    })
    .strict(),
};

export const PersistedRouteQuoteV1Schema = z
  .object({ ...RouteQuoteShape, riskGrade: StoredRiskGradeSchema })
  .strict();

export const RouteQuoteSchema = z
  .object({ ...RouteQuoteShape, riskGrade: PublicRiskGradeSchema })
  .strict();

export type RouteQuote = z.infer<typeof RouteQuoteSchema>;
