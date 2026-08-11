import { z } from "zod";
import { EvidenceRecordSchema, RiskFlagSchema } from "./bundle";
import {
  AtomicAmountSchema,
  HashSchema,
  SignatureSchema,
} from "./primitives";
import { RoutePlanV2Schema } from "./routing-v2-plan";
import { RouteAddressV2Schema } from "./routing-v2-policy";

export const RouteBundleV2Schema = z
  .object({
    version: z.literal(2),
    requestId: z.string().uuid(),
    solverId: z.string().min(1),
    solverAddress: RouteAddressV2Schema,
    policyHash: HashSchema,
    snapshotHash: HashSchema,
    routePlan: RoutePlanV2Schema,
    evidence: z.array(EvidenceRecordSchema).max(32),
    riskFlags: z.array(RiskFlagSchema).max(32),
    estimatedPreGasApyBps: z.number().int().min(0),
    validUntil: z.number().int().positive(),
    signature: SignatureSchema,
  })
  .strict();

export const RouteQuoteV2Schema = z
  .object({
    version: z.literal(2),
    quoteId: HashSchema,
    requestId: z.string().uuid(),
    solverId: z.string().min(1),
    solverAddress: RouteAddressV2Schema,
    bundleHash: HashSchema,
    estimatedPreGasApyBps: z.number().int().min(0),
    riskGrade: z.enum(["unassessed", "moderate", "elevated"]),
    priceAtomic: AtomicAmountSchema,
    validUntil: z.number().int().positive(),
    authorization: z
      .object({
        routeAuthorized: z.boolean(),
        errorCodes: z.array(z.string()),
      })
      .strict(),
  })
  .strict()
  .superRefine((quote, context) => {
    const hasNoErrors = quote.authorization.errorCodes.length === 0;
    if (quote.authorization.routeAuthorized !== hasNoErrors) {
      context.addIssue({
        code: "custom",
        path: ["authorization"],
        message: "Route authorization must agree with its error codes",
      });
    }
  });

export type RouteBundleV2 = z.infer<typeof RouteBundleV2Schema>;
export type RouteQuoteV2 = z.infer<typeof RouteQuoteV2Schema>;
