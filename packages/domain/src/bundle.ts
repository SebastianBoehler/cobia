import { z } from "zod";
import {
  AddressSchema,
  AtomicAmountSchema,
  BasisPointsSchema,
  HashSchema,
  HttpUrlSchema,
  SignatureSchema,
  TimestampSchema,
} from "./primitives";

export const EvidenceRecordSchema = z
  .object({
    url: HttpUrlSchema,
    title: z.string().min(1),
    retrievedAt: TimestampSchema,
    claim: z.string().min(1),
    contentHash: HashSchema,
  })
  .strict();

export const RiskFlagSchema = z
  .object({
    candidateId: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "critical"]),
    code: z.string().min(1),
    summary: z.string().min(1),
    evidenceHashes: z.array(HashSchema).min(1),
  })
  .strict();

export const BundleActionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("hold"), amountAtomic: AtomicAmountSchema })
    .strict(),
  z
    .object({
      kind: z.literal("aave-v3-supply"),
      candidateId: z.string().min(1),
      investmentId: z.string().min(1),
      amountAtomic: AtomicAmountSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("abstain"), reason: z.string().min(1) })
    .strict(),
]);

export const DecisionBundleSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    solverId: z.string().min(1),
    solverAddress: AddressSchema,
    policyHash: HashSchema,
    snapshotHash: HashSchema,
    allocations: z
      .array(
        z
          .object({
            candidateId: z.string().min(1),
            bps: BasisPointsSchema,
          })
          .strict(),
      )
      .min(1),
    evidence: z.array(EvidenceRecordSchema),
    riskFlags: z.array(RiskFlagSchema),
    expectedNetApyBps: z.number().int().min(0),
    action: BundleActionSchema,
    validUntil: z.number().int().positive(),
    signature: SignatureSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    const total = bundle.allocations.reduce((sum, item) => sum + item.bps, 0);
    if (total !== 10_000) {
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Allocations must total 10000 basis points",
      });
    }
    if (new Set(bundle.allocations.map((item) => item.candidateId)).size !== bundle.allocations.length) {
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Allocation candidates must be unique",
      });
    }
  });

export type BundleAction = z.infer<typeof BundleActionSchema>;
export type DecisionBundle = z.infer<typeof DecisionBundleSchema>;
