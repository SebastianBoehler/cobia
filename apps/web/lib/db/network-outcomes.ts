import {
  aggregateNetworkMetricsV1,
  CapabilityCompositionSnapshotV1Schema,
  OpenIntentSnapshotV1Schema,
  projectPublicOutcomeV1,
  type NetworkExclusionReason,
  type NetworkOutcomeCandidateV1,
  type PublicOutcomeV1,
} from "@cobia/domain";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import type { CobiaDatabase } from "./client";
import {
  capabilityNetworkPrincipalV1,
  transactionNetworkPrincipalV1,
} from "./network-outcome-program";
import { cobiaIntents, cobiaProgramArtifactsV2, cobiaSolverSubmissions } from "./schema";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const BlockNumberSchema = z.string().regex(/^[1-9][0-9]*$/);
const ReceiptSchema = z.union([
  z.object({ transactionHash: HashSchema, blockNumber: BlockNumberSchema }).passthrough(),
  z.object({ transactionHash: HashSchema, receipts: z.array(z.object({
    blockNumber: BlockNumberSchema,
  }).passthrough()).min(1) }).passthrough(),
]).transform((receipt) => ({ transactionHash: receipt.transactionHash,
  blockNumber: "blockNumber" in receipt
    ? receipt.blockNumber : receipt.receipts.at(-1)!.blockNumber }));
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

export function networkAssetIdentityV1(snapshot: unknown, token: string) {
  const open = OpenIntentSnapshotV1Schema.safeParse(snapshot);
  const frozen = open.success ? open.data.tokenEvidence?.find(({ token: address }) =>
    address.toLowerCase() === token.toLowerCase()) : undefined;
  return { symbol: frozen?.symbol ?? symbol(token), decimals: frozen?.decimals ?? decimals(token) };
}

export function parseNetworkReceiptV1(payload: unknown) {
  const receipt = ReceiptSchema.safeParse(payload);
  return receipt.success ? receipt.data : null;
}

export { transactionNetworkPrincipalV1 } from "./network-outcome-program";

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

export function projectNetworkOutcomeV1(row: {
  intentId: string;
  owner: string;
  chainId: number;
  submissionId: string;
  solverId: string;
  state: string;
  completedAt: Date;
}, artifacts: Pick<Artifact, "kind" | "payload">[]): ReturnType<typeof projectPublicOutcomeV1> {
  const programArtifact = artifacts.find(({ kind }) => kind === "program");
  const snapshotArtifact = artifacts.find(({ kind }) => kind === "snapshot");
  const receiptArtifact = artifacts.find(({ kind }) => kind === "receipt");
  const principal = programArtifact ? capabilityNetworkPrincipalV1(programArtifact.payload)
    ?? transactionNetworkPrincipalV1(programArtifact.payload) : null;
  if (!principal || !snapshotArtifact) return { excluded: "INVALID_CANDIDATE" };
  const receipt = receiptArtifact ? parseNetworkReceiptV1(receiptArtifact.payload) : null;
  const principals = principal.principals.map((value) => ({
    ...value,
    ...networkAssetIdentityV1(snapshotArtifact.payload, value.token),
    valuation: valuation(snapshotArtifact.payload, value.token),
  }));
  const route = { ...principal.route, minimumOutputs: principal.route.minimumOutputs.map((output) => ({
    ...output, ...networkAssetIdentityV1(snapshotArtifact.payload, output.token),
  })) };
  const candidate: NetworkOutcomeCandidateV1 = {
    intentId: row.intentId,
    submissionId: row.submissionId,
    solverId: row.solverId,
    owner: row.owner,
    chainId: principal.chainId,
    state: row.state,
    selected: true,
    confirmedAtSec: Math.floor(row.completedAt.getTime() / 1_000),
    transactionHash: receipt?.transactionHash ?? null,
    intentClass: principal.intentClass,
    principal: { token: principals[0]!.token, symbol: principals[0]!.symbol, atomic: principals[0]!.atomic },
    additionalPrincipals: principals.slice(1).map(({ token, symbol, atomic, valuation: value }) => ({
      token, symbol, atomic, valuation: value,
    })),
    route,
    valuation: principals[0]!.valuation,
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
        const result = projectNetworkOutcomeV1(
          { ...row, completedAt: row.completedAt },
          bySubmission.get(row.submissionId) ?? [],
        );
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
