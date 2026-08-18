import { type Hash } from "viem";
import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));

export const CommerceProgramEvidenceV1Schema = z.object({
  version: z.literal(1),
  chainId: z.literal(196),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
  capturedAtSec: z.number().int().positive().safe(),
  programHash: HashSchema,
  compiledActionHash: HashSchema,
  traceHash: HashSchema,
  stateDiffHash: HashSchema,
  receiptCommitment: HashSchema,
}).strict();

export type CommerceProgramEvidenceV1 = z.infer<typeof CommerceProgramEvidenceV1Schema>;
