import { z } from "zod";
import {
  AddressSchema,
  BasisPointsSchema,
  PositiveAtomicAmountSchema,
} from "./primitives";

export const MAX_SNAPSHOT_AGE_SECONDS = 300;

export const StablecoinPolicySchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    owner: AddressSchema,
    executionChainId: z.literal(196),
    asset: AddressSchema,
    principalAtomic: PositiveAtomicAmountSchema,
    maxProtocolExposureBps: BasisPointsSchema.min(1),
    minTvlUsdE6: z.string().regex(/^(0|[1-9][0-9]*)$/),
    minNetApyBps: z.number().int().min(0),
    maxSnapshotAgeSec: z.number().int().positive().max(MAX_SNAPSHOT_AGE_SECONDS),
    deadline: z.number().int().positive(),
    noBridges: z.literal(true),
  })
  .strict();

export type StablecoinPolicy = z.infer<typeof StablecoinPolicySchema>;

export function parseStablecoinPolicy(
  input: unknown,
  nowSec: number,
): StablecoinPolicy {
  const policy = StablecoinPolicySchema.parse(input);
  if (policy.deadline <= nowSec) {
    throw new Error("Policy deadline must be in the future");
  }
  return policy;
}
