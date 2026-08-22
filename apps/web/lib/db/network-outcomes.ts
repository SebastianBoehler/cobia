import {
  aggregateNetworkMetricsV1,
  CapabilityCompositionSnapshotV1Schema,
  OpenIntentSnapshotV1Schema,
  projectPublicOutcomeV1,
  TransactionProgramV1Schema,
  type NetworkExclusionReason,
  type NetworkOutcomeCandidateV1,
  type PublicOutcomeV1,
} from "@cobia/domain";
import { CapabilityProgramV2Schema } from "@cobia/solvers";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import type { CobiaDatabase } from "./client";
import { cobiaIntents, cobiaProgramArtifactsV2, cobiaSolverSubmissions } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const ReceiptSchema = z.object({
  transactionHash: HashSchema,
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
}).passthrough();
const ReadSchema = z.object({
  window: z.enum(["30d", "all"]),
  limit: z.number().int().min(1).max(50),
  cursor: z.string().uuid().nullable(),
  observedAtSec: z.number().int().positive().safe(),
}).strict();

type Artifact = typeof cobiaProgramArtifactsV2.$inferSelect;

function symbol(token: string): string {
  return SUPPORTED_ASSETS.find(({ address }) => address.toLowerCase() === token)?.displaySymbol
    ?? `Token ${token.slice(0, 6)}…${token.slice(-4)}`;
}

function decimals(token: string): number | null {
  return SUPPORTED_ASSETS.find(({ address }) => address.toLowerCase() === token)?.decimals ?? null;
}

const protocolPrefixes = [
  ["aave-v3.", "Aave V3"],
  ["curve-stableswap-ng.", "Curve"],
  ["uniswap-v3.", "Uniswap V3"],
] as const;

function protocols(ids: readonly string[]): string[] {
  const matched = ids.flatMap((id) => {
    const protocol = protocolPrefixes.find(([prefix]) => id.startsWith(prefix))?.[1];
    return protocol ? [protocol] : [];
  });
  return matched.filter((protocol, index) => matched.indexOf(protocol) === index);
}

function routeOutput(token: string, atomic: string) {
  return { token, symbol: symbol(token), atomic, decimals: decimals(token) };
}

function capabilityPrincipal(payload: unknown) {
  const parsed = CapabilityProgramV2Schema.safeParse(payload);
  if (!parsed.success) return null;
  const ids = parsed.data.actions.map(({ capabilityId }) => capabilityId);
  const hasSwap = ids.some((id) => id.includes("exact-input"));
  const hasSupply = ids.some((id) => id.includes("supply"));
  return {
    chainId: parsed.data.chainId,
    token: parsed.data.input.token,
    atomic: parsed.data.input.atomic,
    intentClass: hasSwap && hasSupply ? "yield-composition"
      : hasSwap ? "stablecoin-swap" : hasSupply ? "protocol-supply" : "onchain-outcome",
    resultLabel: hasSwap && hasSupply ? "Verified swap and supply"
      : hasSwap ? "Verified token swap" : hasSupply ? "Verified protocol supply"
        : "Verified X Layer outcome",
    route: {
      protocols: protocols(ids),
      minimumOutputs: parsed.data.balanceConstraints.map(({ token, atomic }) => routeOutput(token, atomic)),
    },
  };
}

function transactionPrincipal(payload: unknown) {
  const parsed = TransactionProgramV1Schema.safeParse(payload);
  if (!parsed.success) return null;
  const roots = parsed.data.stages.filter(({ dependsOn, kind }) =>
    dependsOn.length === 0 && ["wallet-transaction", "cobia-v3", "x402-authorization"].includes(kind));
  if (roots.length !== 1) return null;
  const stage = roots[0]!;
  if (stage.kind === "wallet-transaction") return {
    chainId: stage.chainId,
    token: stage.input.token,
    atomic: stage.input.atomic,
    intentClass: "wallet-transaction",
    resultLabel: "Verified wallet transaction",
    route: {
      protocols: protocols(stage.tools),
      minimumOutputs: [routeOutput(stage.output.token, stage.output.minimumAtomic)],
    },
  };
  if (stage.kind === "cobia-v3") return {
    chainId: stage.chainId,
    token: stage.input.token,
    atomic: stage.input.atomic,
    intentClass: "cobia-v3",
    resultLabel: "Verified atomic outcome",
    route: { protocols: [], minimumOutputs: stage.minimumOutcomes.map(({ token, minimumAtomic }) =>
      routeOutput(token, minimumAtomic)), },
  };
  if (stage.kind === "x402-authorization") return {
    chainId: stage.chainId,
    token: stage.asset,
    atomic: stage.exactAtomic,
    intentClass: "x402-payment",
    resultLabel: "Verified x402 settlement",
    route: { protocols: [], minimumOutputs: [] },
  };
  return null;
}

function decimalUsdE8(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  return (BigInt(match[1]!) * 100_000_000n +
    BigInt((match[2] ?? "").slice(0, 8).padEnd(8, "0") || "0")).toString();
}

function valuation(payload: unknown, token: string) {
  const composition = CapabilityCompositionSnapshotV1Schema.safeParse(payload);
  if (composition.success) {
    const value = composition.data.route.valuations.find(({ asset }) => asset === token);
    return value ? { decimals: value.decimals, priceUsdE8: value.priceUsdE8,
      blockNumber: composition.data.route.blockNumber } : null;
  }
  const open = OpenIntentSnapshotV1Schema.safeParse(payload);
  if (!open.success) return null;
  const value = open.data.tokenEvidence?.find(({ chainId, token: asset }) =>
    chainId === 196 && asset === token);
  const anchor = open.data.anchors.find(({ chainId }) => chainId === 196);
  const priceUsdE8 = value ? decimalUsdE8(value.priceUsd) : null;
  return value && anchor && priceUsdE8
    ? { decimals: value.decimals, priceUsdE8, blockNumber: anchor.blockNumber } : null;
}

function increment(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function project(row: {
  intentId: string;
  owner: string;
  chainId: number;
  submissionId: string;
  solverId: string;
  state: string;
  completedAt: Date;
}, artifacts: Artifact[]): ReturnType<typeof projectPublicOutcomeV1> {
  const programArtifact = artifacts.find(({ kind }) => kind === "program");
  const snapshotArtifact = artifacts.find(({ kind }) => kind === "snapshot");
  const receiptArtifact = artifacts.find(({ kind }) => kind === "receipt");
  const principal = programArtifact
    ? capabilityPrincipal(programArtifact.payload) ?? transactionPrincipal(programArtifact.payload) : null;
  if (!principal || !snapshotArtifact) return { excluded: "INVALID_CANDIDATE" };
  const receipt = receiptArtifact ? ReceiptSchema.safeParse(receiptArtifact.payload) : null;
  const candidate: NetworkOutcomeCandidateV1 = {
    intentId: row.intentId,
    submissionId: row.submissionId,
    solverId: row.solverId,
    owner: row.owner,
    chainId: principal.chainId,
    state: row.state,
    selected: true,
    confirmedAtSec: Math.floor(row.completedAt.getTime() / 1_000),
    transactionHash: receipt?.success ? receipt.data.transactionHash : null,
    intentClass: principal.intentClass,
    principal: { token: principal.token, symbol: symbol(principal.token), atomic: principal.atomic },
    route: principal.route,
    valuation: valuation(snapshotArtifact.payload, principal.token),
    resultLabel: principal.resultLabel,
  };
  return projectPublicOutcomeV1(candidate);
}

export function createNetworkOutcomeRepository(db: CobiaDatabase) {
  return {
    async read(value: z.input<typeof ReadSchema>) {
      const input = ReadSchema.parse(value);
      const conditions = [
        eq(cobiaSolverSubmissions.state, "executed"),
        eq(cobiaIntents.selectedSubmissionId, cobiaSolverSubmissions.id),
        eq(cobiaIntents.chainId, 196),
      ];
      if (input.window === "30d") {
        conditions.push(gte(cobiaSolverSubmissions.completedAt,
          new Date((input.observedAtSec - 30 * 24 * 60 * 60) * 1_000)));
      }
      const rows = await db.select({
        intentId: cobiaIntents.id,
        owner: cobiaIntents.owner,
        chainId: cobiaIntents.chainId,
        submissionId: cobiaSolverSubmissions.id,
        solverId: cobiaSolverSubmissions.solverId,
        state: cobiaSolverSubmissions.state,
        completedAt: cobiaSolverSubmissions.completedAt,
      }).from(cobiaSolverSubmissions).innerJoin(cobiaIntents,
        eq(cobiaIntents.id, cobiaSolverSubmissions.intentId))
        .where(and(...conditions)).orderBy(desc(cobiaSolverSubmissions.completedAt));
      const artifacts = rows.length === 0 ? [] : await db.query.cobiaProgramArtifactsV2.findMany({
        where: and(inArray(cobiaProgramArtifactsV2.submissionId, rows.map(({ submissionId }) => submissionId)),
          inArray(cobiaProgramArtifactsV2.kind, ["program", "snapshot", "receipt"])),
      });
      const bySubmission = new Map<string, Artifact[]>();
      for (const artifact of artifacts) {
        bySubmission.set(artifact.submissionId, [...(bySubmission.get(artifact.submissionId) ?? []), artifact]);
      }
      const outcomes: PublicOutcomeV1[] = [];
      const exclusions: Record<string, number> = {};
      for (const row of rows) {
        if (!row.completedAt) { increment(exclusions, "INVALID_CANDIDATE"); continue; }
        const result = project({ ...row, completedAt: row.completedAt }, bySubmission.get(row.submissionId) ?? []);
        if ("outcome" in result) outcomes.push(result.outcome);
        else increment(exclusions, result.excluded satisfies NetworkExclusionReason);
      }
      const cursorIndex = input.cursor ? outcomes.findIndex(({ submissionId }) => submissionId === input.cursor) : -1;
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const page = outcomes.slice(start, start + input.limit);
      return {
        version: 1 as const,
        observedAt: input.observedAtSec,
        window: input.window,
        metrics: aggregateNetworkMetricsV1({ outcomes }),
        outcomes: page,
        nextCursor: outcomes.length > start + input.limit ? page.at(-1)!.submissionId : null,
        exclusions,
      };
    },
  };
}
