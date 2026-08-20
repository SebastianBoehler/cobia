import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import { commitment } from "./canonical";

const AddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
  "Addresses must use lowercase canonical form",
).transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const NonZeroHashSchema = HashSchema.refine((value) => !/^0x0{64}$/.test(value));
const CapabilitySchema = z.string()
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*@[1-9][0-9]*$/).max(96);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const SolverProfileClaimV1Schema = z.object({
  version: z.literal(1),
  solverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  displayName: z.string().trim().min(1).max(80),
  operator: AddressSchema,
  declaredCapabilities: z.array(CapabilitySchema).max(32),
  nonce: NonZeroHashSchema,
  issuedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
}).strict().superRefine((claim, context) => {
  if (!sortedUnique(claim.declaredCapabilities)) {
    context.addIssue({
      code: "custom",
      path: ["declaredCapabilities"],
      message: "Capabilities must be sorted and unique",
    });
  }
  if (claim.expiresAt <= claim.issuedAt || claim.expiresAt - claim.issuedAt > 900) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Claim lifetime is invalid" });
  }
});

export type SolverProfileClaimV1 = z.infer<typeof SolverProfileClaimV1Schema>;

export function parseSolverProfileClaimV1(input: unknown, nowSec: number): SolverProfileClaimV1 {
  const claim = SolverProfileClaimV1Schema.parse(input);
  if (claim.issuedAt > nowSec) throw new Error("Solver profile claim is not active");
  if (claim.expiresAt <= nowSec) throw new Error("Solver profile claim expired");
  return claim;
}

export function solverProfileClaimCommitmentV1(input: SolverProfileClaimV1): Hash {
  return commitment(SolverProfileClaimV1Schema.parse(input)) as Hash;
}

export const SolverDecisionClaimV1Schema = z.object({
  version: z.literal(1),
  solverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  intentId: z.string().uuid(),
  revision: z.number().int().min(1).max(20),
  decisionHash: NonZeroHashSchema,
  snapshotHash: NonZeroHashSchema,
  nonce: NonZeroHashSchema,
  issuedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
}).strict().superRefine((claim, context) => {
  if (claim.expiresAt <= claim.issuedAt || claim.expiresAt - claim.issuedAt > 300) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Decision lifetime is invalid" });
  }
});

export type SolverDecisionClaimV1 = z.infer<typeof SolverDecisionClaimV1Schema>;

export function parseSolverDecisionClaimV1(input: unknown, nowSec: number): SolverDecisionClaimV1 {
  const claim = SolverDecisionClaimV1Schema.parse(input);
  if (claim.issuedAt > nowSec) throw new Error("Solver decision claim is not active");
  if (claim.expiresAt <= nowSec) throw new Error("Solver decision claim expired");
  return claim;
}

export function solverDecisionClaimCommitmentV1(input: SolverDecisionClaimV1): Hash {
  return commitment(SolverDecisionClaimV1Schema.parse(input)) as Hash;
}
