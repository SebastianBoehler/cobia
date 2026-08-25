import { z } from "zod";

const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const PublicAssetSchema = z.object({
  token: AddressSchema,
  symbol: z.string().trim().min(1).max(32),
  atomic: AtomicSchema.refine((value) => value !== "0"),
  decimals: z.number().int().min(0).max(36).nullable(),
}).strict();
const PublicRouteSchema = z.object({
  protocols: z.array(z.string().trim().min(1).max(32)).max(8),
  minimumOutputs: z.array(PublicAssetSchema).max(8),
}).strict();
const CandidateValuationSchema = z.object({
  decimals: z.number().int().min(0).max(36),
  priceUsdE8: AtomicSchema.refine((value) => value !== "0"),
  blockNumber: AtomicSchema.refine((value) => value !== "0"),
}).strict();
const CandidatePrincipalSchema = z.object({
  token: AddressSchema,
  symbol: z.string().trim().min(1).max(32),
  atomic: AtomicSchema.refine((value) => value !== "0"),
}).strict();

const NetworkOutcomeCandidateV1Schema = z.object({
  intentId: z.string().uuid(),
  submissionId: z.string().uuid(),
  solverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  owner: AddressSchema,
  chainId: z.number().int().positive(),
  state: z.string().min(1),
  selected: z.boolean(),
  confirmedAtSec: z.number().int().positive().safe(),
  transactionHash: HashSchema.nullable(),
  intentClass: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  principal: CandidatePrincipalSchema,
  additionalPrincipals: z.array(CandidatePrincipalSchema.extend({
    valuation: CandidateValuationSchema.nullable(),
  }).strict()).max(7).default([]),
  route: PublicRouteSchema,
  valuation: CandidateValuationSchema.nullable(),
  resultLabel: z.string().trim().min(1).max(160),
}).strict();

export type NetworkOutcomeCandidateV1 = z.input<typeof NetworkOutcomeCandidateV1Schema>;

export type NetworkExclusionReason =
  | "INVALID_CANDIDATE"
  | "NOT_SELECTED"
  | "NOT_EXECUTED"
  | "UNSUPPORTED_CHAIN"
  | "RECEIPT_MISSING";

const PublicPrincipalSchema = z.object({
  token: AddressSchema,
  symbol: z.string(),
  atomic: AtomicSchema,
  decimals: z.number().int().min(0).max(36).nullable(),
  valuationBlockNumber: AtomicSchema.nullable(),
}).strict();

const PublicOutcomeV1Schema = z.object({
  version: z.literal(1),
  intentId: z.string().uuid(),
  submissionId: z.string().uuid(),
  solverId: z.string(),
  ownerLabel: z.string().regex(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/),
  chainId: z.literal(196),
  confirmedAtSec: z.number().int().positive(),
  transactionHash: HashSchema,
  intentClass: z.string(),
  principal: PublicPrincipalSchema,
  additionalPrincipals: z.array(PublicPrincipalSchema).max(7),
  route: PublicRouteSchema,
  volumeUsdE8: AtomicSchema.nullable(),
  resultLabel: z.string(),
}).strict();

export type PublicOutcomeV1 = z.infer<typeof PublicOutcomeV1Schema>;

export interface NetworkMetricsV1 {
  version: 1;
  totals: {
    confirmedOutcomes: number;
    valuedOutcomes: number;
    unvaluedOutcomes: number;
    verifiedVolumeUsdE8: string;
  };
  solvers: {
    solverId: string;
    confirmedOutcomes: number;
    valuedOutcomes: number;
    verifiedVolumeUsdE8: string;
  }[];
}

function ownerLabel(owner: string): string {
  return `${owner.slice(0, 6)}…${owner.slice(-4)}`;
}

export function projectPublicOutcomeV1(input: NetworkOutcomeCandidateV1):
  | { outcome: PublicOutcomeV1 }
  | { excluded: NetworkExclusionReason } {
  const parsed = NetworkOutcomeCandidateV1Schema.safeParse(input);
  if (!parsed.success) return { excluded: "INVALID_CANDIDATE" };
  const value = parsed.data;
  if (!value.selected) return { excluded: "NOT_SELECTED" };
  if (value.state !== "executed") return { excluded: "NOT_EXECUTED" };
  if (value.chainId !== 196) return { excluded: "UNSUPPORTED_CHAIN" };
  if (!value.transactionHash) return { excluded: "RECEIPT_MISSING" };

  const valuedPrincipals = [
    { ...value.principal, valuation: value.valuation },
    ...value.additionalPrincipals,
  ];
  const volumeUsdE8 = valuedPrincipals.every(({ valuation }) => valuation !== null)
    ? valuedPrincipals.reduce((total, principal) => total +
      BigInt(principal.atomic) * BigInt(principal.valuation!.priceUsdE8) /
      10n ** BigInt(principal.valuation!.decimals), 0n).toString()
    : null;
  return { outcome: PublicOutcomeV1Schema.parse({
    version: 1,
    intentId: value.intentId,
    submissionId: value.submissionId,
    solverId: value.solverId,
    ownerLabel: ownerLabel(value.owner),
    chainId: 196,
    confirmedAtSec: value.confirmedAtSec,
    transactionHash: value.transactionHash,
    intentClass: value.intentClass,
    principal: {
      token: value.principal.token,
      symbol: value.principal.symbol,
      atomic: value.principal.atomic,
      decimals: value.valuation?.decimals ?? null,
      valuationBlockNumber: value.valuation?.blockNumber ?? null,
    },
    additionalPrincipals: value.additionalPrincipals.map((principal) => ({
      token: principal.token,
      symbol: principal.symbol,
      atomic: principal.atomic,
      decimals: principal.valuation?.decimals ?? null,
      valuationBlockNumber: principal.valuation?.blockNumber ?? null,
    })),
    route: value.route,
    volumeUsdE8,
    resultLabel: value.resultLabel,
  }) };
}

export function aggregateNetworkMetricsV1(input: { outcomes: PublicOutcomeV1[] }): NetworkMetricsV1 {
  const ids = new Set<string>();
  const solvers = new Map<string, {
    confirmedOutcomes: number;
    valuedOutcomes: number;
    verifiedVolumeUsdE8: bigint;
  }>();
  let valuedOutcomes = 0;
  let verifiedVolumeUsdE8 = 0n;

  for (const raw of input.outcomes) {
    const outcome = PublicOutcomeV1Schema.parse(raw);
    if (ids.has(outcome.submissionId)) throw new Error("Duplicate network outcome");
    ids.add(outcome.submissionId);
    const solver = solvers.get(outcome.solverId) ?? {
      confirmedOutcomes: 0, valuedOutcomes: 0, verifiedVolumeUsdE8: 0n,
    };
    solver.confirmedOutcomes += 1;
    if (outcome.volumeUsdE8 !== null) {
      valuedOutcomes += 1;
      const volume = BigInt(outcome.volumeUsdE8);
      verifiedVolumeUsdE8 += volume;
      solver.valuedOutcomes += 1;
      solver.verifiedVolumeUsdE8 += volume;
    }
    solvers.set(outcome.solverId, solver);
  }

  return {
    version: 1,
    totals: {
      confirmedOutcomes: input.outcomes.length,
      valuedOutcomes,
      unvaluedOutcomes: input.outcomes.length - valuedOutcomes,
      verifiedVolumeUsdE8: verifiedVolumeUsdE8.toString(),
    },
    solvers: [...solvers].sort(([left], [right]) => left.localeCompare(right))
      .map(([solverId, value]) => ({
        solverId,
        confirmedOutcomes: value.confirmedOutcomes,
        valuedOutcomes: value.valuedOutcomes,
        verifiedVolumeUsdE8: value.verifiedVolumeUsdE8.toString(),
      })),
  };
}
