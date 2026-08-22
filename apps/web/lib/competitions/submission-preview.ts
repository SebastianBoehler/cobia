import { z } from "zod";
import { isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const SnapshotSchema = z.object({ tokenEvidence: z.array(z.object({
  token: AddressSchema, symbol: z.string().min(1), decimals: z.number().int().min(0).max(36),
})).optional() }).passthrough();
const ProgramSchema = z.object({
  actions: z.array(z.object({ capabilityId: z.string().optional(),
    capabilityVersion: z.number().optional() })
    .passthrough()).optional(),
  balanceConstraints: z.array(z.object({ token: AddressSchema, atomic: z.string().regex(/^\d+$/) })).optional(),
}).passthrough();
const EvidenceSchema = z.object({ balanceDeltas: z.array(z.object({
  token: AddressSchema, beforeAtomic: z.string().regex(/^\d+$/), afterAtomic: z.string().regex(/^\d+$/),
})).min(1) }).passthrough();
const V3ExecutionSchema = z.object({ program: z.object({ actions: z.array(z.object({
  approvals: z.array(z.unknown()).optional(),
})).optional() }).optional() }).passthrough();
const WalletBatchSchema = z.object({ kind: z.literal("wallet-call-batch"), stages: z.array(z.object({
  calls: z.array(z.unknown()),
})) }).passthrough();

export interface CompetitionProgramPreview {
  outcomes: {
    symbol: string;
    decimals: number;
    beforeAtomic: string;
    afterAtomic: string;
    minimumAtomic?: string;
  }[];
  stepCount: number;
  actions?: string[];
}

const protocolPrefixes = [
  ["aave-v3.", "Aave V3"],
  ["curve-stableswap-ng.", "Curve"],
  ["uniswap-v3.", "Uniswap V3"],
] as const;

export function projectProgramProtocols(payload: unknown): string[] {
  const program = ProgramSchema.safeParse(payload);
  if (!program.success) return [];
  const protocols = program.data.actions?.flatMap(({ capabilityId }) => {
    const match = capabilityId && protocolPrefixes.find(([prefix]) => capabilityId.startsWith(prefix));
    return match ? [match[1]] : [];
  }) ?? [];
  return protocols.filter((protocol, index) => protocols.indexOf(protocol) === index);
}

function registeredToken(token: string) {
  for (const [symbol, asset] of Object.entries(PROTOCOL_REGISTRY.aaveV3.assets)) {
    if (isAddressEqual(asset.underlying.address, token as Address)) {
      return { symbol, decimals: asset.decimals };
    }
    if (isAddressEqual(asset.aToken.address, token as Address)) {
      return { symbol: `a${symbol}`, decimals: asset.decimals };
    }
  }
  return undefined;
}

export function projectCompetitionProgramPreview(
  artifacts: readonly { kind: string; payload: unknown }[],
): CompetitionProgramPreview | null {
  const payload = (kind: string) => artifacts.find((artifact) => artifact.kind === kind)?.payload;
  const evidence = EvidenceSchema.safeParse(payload("evidence"));
  if (!evidence.success) return null;
  const snapshot = SnapshotSchema.safeParse(payload("snapshot"));
  const program = ProgramSchema.safeParse(payload("program"));
  const tokenEvidence = snapshot.success ? snapshot.data.tokenEvidence ?? [] : [];
  const constraints = program.success ? program.data.balanceConstraints ?? [] : [];
  const execution = V3ExecutionSchema.safeParse(payload("execution"));
  const batch = WalletBatchSchema.safeParse(payload("execution"));
  const approvalSteps = execution.success
    ? execution.data.program?.actions?.reduce((total, action) => total + (action.approvals?.length ?? 0), 0) ?? 0
    : 0;
  const routeSteps = program.success ? program.data.actions?.length ?? 0 : 0;
  const batchSteps = batch.success
    ? batch.data.stages.reduce((total, stage) => total + stage.calls.length, 0)
    : 0;

  return {
    outcomes: evidence.data.balanceDeltas.map((delta) => {
      const token = tokenEvidence.find((item) => item.token.toLowerCase() === delta.token.toLowerCase())
        ?? registeredToken(delta.token);
      const constraint = constraints.find((item) => item.token.toLowerCase() === delta.token.toLowerCase());
      return {
        symbol: token?.symbol ?? "Token",
        decimals: token?.decimals ?? 6,
        beforeAtomic: delta.beforeAtomic,
        afterAtomic: delta.afterAtomic,
        ...(constraint && { minimumAtomic: constraint.atomic }),
      };
    }),
    stepCount: batch.success ? batchSteps : approvalSteps + routeSteps,
    ...(program.success && program.data.actions?.length && program.data.actions.every(
      ({ capabilityId, capabilityVersion }) => capabilityId && capabilityVersion)
      ? { actions: program.data.actions.map(
        ({ capabilityId, capabilityVersion }) => `${capabilityId}@${capabilityVersion}`) } : {}),
  };
}
