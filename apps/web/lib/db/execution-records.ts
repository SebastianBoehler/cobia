import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hex } from "viem";
import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);
const AddressSchema = z.string().refine(isAddress)
  .transform((value) => value.toLowerCase() as Address);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const CalldataSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((value) => value.toLowerCase() as Hex);

export const BeginExecutionInputSchema = z.object({
  routeId: HashSchema,
  bundleHash: HashSchema,
  buyer: AddressSchema,
  executionChainId: z.literal(196),
  rehearsalId: z.uuid(),
  rehearsalTraceHash: HashSchema,
  proofHash: HashSchema,
  proofNonce: HashSchema,
  proofExpiresAt: z.date(),
  nowSec: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  const expiresAt = Math.floor(value.proofExpiresAt.getTime() / 1_000);
  if (value.routeId !== value.bundleHash) {
    context.addIssue({ code: "custom", message: "Route and bundle hashes must match" });
  }
  if (expiresAt <= value.nowSec || expiresAt > value.nowSec + 300) {
    context.addIssue({ code: "custom", message: "Execution proof is outside its allowed window" });
  }
});

export const PrepareExecutionStepInputSchema = z.object({
  attemptId: z.uuid(),
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(["approval", "swap", "supply"]),
  from: AddressSchema,
  to: AddressSchema,
  valueAtomic: AtomicSchema,
  data: CalldataSchema,
  calldataHash: HashSchema,
  semantic: z.record(z.string(), z.unknown()),
  preBlockNumber: AtomicSchema,
  preBlockHash: HashSchema,
  expectedNonce: AtomicSchema,
  gasEstimateAtomic: AtomicSchema,
}).strict().superRefine((value, context) => {
  if (commitment(value.data) !== value.calldataHash) {
    context.addIssue({ code: "custom", message: "Calldata hash does not match calldata" });
  }
});

export const ConfirmExecutionStepInputSchema = z.object({
  transactionHash: HashSchema,
  receipt: z.record(z.string(), z.unknown()),
  evidence: z.record(z.string(), z.unknown()),
  postcondition: z.record(z.string(), z.unknown()),
  complete: z.boolean(),
}).strict();

const SafeFailureCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

export type BeginExecutionInput = z.input<typeof BeginExecutionInputSchema>;
export type PrepareExecutionStepInput = z.input<typeof PrepareExecutionStepInputSchema>;
export type ConfirmExecutionStepInput = z.input<typeof ConfirmExecutionStepInputSchema>;

export function safeExecutionFailureCode(value: string): string {
  return SafeFailureCodeSchema.parse(value);
}
