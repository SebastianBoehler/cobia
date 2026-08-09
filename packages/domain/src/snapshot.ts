import { z } from "zod";
import {
  AddressSchema,
  AtomicAmountSchema,
  BasisPointsSchema,
  HashSchema,
  TimestampSchema,
} from "./primitives";

const CandidateBaseSchema = z.object({
  id: z.string().min(1),
  apyBps: z.number().int().min(0),
  tvlUsdE6: AtomicAmountSchema,
  retrievedAt: TimestampSchema,
});

export const CashCandidateSchema = CandidateBaseSchema.extend({
  kind: z.literal("cash"),
  apyBps: z.literal(0),
}).strict();

export const AaveCandidateSchema = CandidateBaseSchema.extend({
  kind: z.literal("aave-v3"),
  investmentId: z.string().min(1),
  poolAddress: AddressSchema,
  utilizationBps: BasisPointsSchema,
}).strict();

export const MarketCandidateSchema = z.discriminatedUnion("kind", [
  CashCandidateSchema,
  AaveCandidateSchema,
]);

export const MarketSnapshotSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    chainId: z.literal(196),
    blockNumber: AtomicAmountSchema,
    blockHash: HashSchema,
    capturedAt: TimestampSchema,
    asset: z
      .object({
        address: AddressSchema,
        symbol: z.string().min(1).max(16),
        decimals: z.number().int().min(0).max(36),
      })
      .strict(),
    candidates: z.array(MarketCandidateSchema).min(1),
  })
  .strict();

export type MarketCandidate = z.infer<typeof MarketCandidateSchema>;
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
