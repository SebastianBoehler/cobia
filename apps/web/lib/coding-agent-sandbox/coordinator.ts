import type {
  CapabilityProgramEvidenceV1,
  CapabilityProgramV1,
  CapabilitySandboxProvenanceV1,
  CompiledCapabilityActionV1,
} from "@cobia/solvers";
import type { Address } from "viem";

type ArtifactKind =
  | "program" | "evidence" | "provenance" | "verdict"
  | "replay" | "execution" | "authorization";

interface AgentProgramStore {
  create(input: unknown): Promise<{ id: string }>;
  start(id: string): Promise<unknown>;
  append(id: string, kind: ArtifactKind, payload: unknown): Promise<unknown>;
  markVerified(id: string): Promise<unknown>;
  markAttested(id: string): Promise<unknown>;
  reject(id: string, code: string): Promise<unknown>;
  fail(id: string, code: string): Promise<unknown>;
}

interface VerificationResult {
  accepted: boolean;
  errorCodes: readonly string[];
  compiled: readonly CompiledCapabilityActionV1[];
  replay?: unknown;
}

export interface CoordinateCapabilityInputV1 {
  job: {
    requestId: string;
    owner: Address;
    policyHash: string;
    snapshotHash: string;
    manifestHash: string;
    blockNumber: string;
    blockHash: string;
  };
  policy: unknown;
  snapshot: unknown;
  portfolio: { balances: readonly unknown[]; allowances: readonly unknown[]; positions: readonly unknown[] };
  manifest: unknown;
  executor: Address;
}

export interface CoordinateCapabilityDependenciesV1 {
  programs: AgentProgramStore;
  runSandbox(input: CoordinateCapabilityInputV1): Promise<{
    program: CapabilityProgramV1;
    evidence: CapabilityProgramEvidenceV1;
    provenance: CapabilitySandboxProvenanceV1;
  }>;
  verify(input: {
    policy: unknown;
    snapshot: unknown;
    portfolio: CoordinateCapabilityInputV1["portfolio"];
    manifest: unknown;
    program: CapabilityProgramV1;
    evidence: CapabilityProgramEvidenceV1;
  }): Promise<VerificationResult>;
  project(input: {
    program: CapabilityProgramV1;
    evidence: CapabilityProgramEvidenceV1;
    verification: VerificationResult;
  }): unknown;
  attest(input: {
    execution: unknown;
    program: CapabilityProgramV1;
    evidence: CapabilityProgramEvidenceV1;
  }): Promise<unknown>;
}

function safeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "VERIFIER_REJECTED";
}

export async function coordinateCapabilityProgramV1(
  input: CoordinateCapabilityInputV1,
  dependencies: CoordinateCapabilityDependenciesV1,
) {
  const job = await dependencies.programs.create(input.job);
  await dependencies.programs.start(job.id);
  let stage = "SANDBOX";
  try {
    const generated = await dependencies.runSandbox(input);
    await dependencies.programs.append(job.id, "program", generated.program);
    await dependencies.programs.append(job.id, "evidence", generated.evidence);
    await dependencies.programs.append(job.id, "provenance", generated.provenance);

    stage = "VERIFIER";
    const verification = await dependencies.verify({
      policy: input.policy,
      snapshot: input.snapshot,
      portfolio: input.portfolio,
      manifest: input.manifest,
      program: generated.program,
      evidence: generated.evidence,
    });
    await dependencies.programs.append(job.id, "verdict", {
      accepted: verification.accepted,
      errorCodes: verification.errorCodes,
    });
    if (!verification.accepted || verification.errorCodes.length > 0 || !verification.replay) {
      const code = safeCode(verification.errorCodes[0] ?? "REPLAY_MISSING");
      await dependencies.programs.reject(job.id, code);
      throw new Error(`Capability program rejected: ${code}`);
    }
    await dependencies.programs.append(job.id, "replay", verification.replay);

    stage = "PROJECTION";
    const execution = dependencies.project({
      program: generated.program,
      evidence: generated.evidence,
      verification,
    });
    await dependencies.programs.append(job.id, "execution", execution);
    await dependencies.programs.markVerified(job.id);

    stage = "ATTESTATION";
    const authorization = await dependencies.attest({
      execution,
      program: generated.program,
      evidence: generated.evidence,
    });
    await dependencies.programs.append(job.id, "authorization", authorization);
    await dependencies.programs.markAttested(job.id);
    return {
      jobId: job.id,
      program: generated.program,
      evidence: generated.evidence,
      execution,
      authorization,
    };
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Capability program rejected:"))) {
      try {
        await dependencies.programs.fail(job.id, `${stage}_FAILED`);
      } catch (persistenceError) {
        throw new AggregateError(
          [error, persistenceError],
          "Capability program failed and its failure state could not be persisted",
        );
      }
    }
    throw error;
  }
}
