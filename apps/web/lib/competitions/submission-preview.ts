import { z } from "zod";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const SnapshotSchema = z.object({ tokenEvidence: z.array(z.object({
  token: AddressSchema, symbol: z.string().min(1), decimals: z.number().int().min(0).max(36),
})).optional() }).passthrough();
const ProgramSchema = z.object({
  actions: z.array(z.unknown()).optional(),
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
      const token = tokenEvidence.find((item) => item.token.toLowerCase() === delta.token.toLowerCase());
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
  };
}
