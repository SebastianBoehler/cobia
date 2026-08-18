import type {
  CapabilityProgramEvidenceV2,
  CapabilityProgramV2,
  CapabilitySandboxProvenanceV2,
  CompiledCapabilityActionV1,
} from "@cobia/solvers";
import type { CoordinateCapabilityInputV1 } from "./coordinator";

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

interface VerificationResultV2 {
  accepted: boolean;
  errorCodes: readonly string[];
  compiled: readonly CompiledCapabilityActionV1[];
  replay?: unknown;
}

export interface CoordinateCapabilityDependenciesV2 {
  programs: AgentProgramStore;
  runSandbox(input: CoordinateCapabilityInputV1, jobId: string): Promise<{
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
    provenance: CapabilitySandboxProvenanceV2;
  }>;
  verify(input: {
    policy: unknown;
    snapshot: unknown;
    portfolio: CoordinateCapabilityInputV1["portfolio"];
    manifest: unknown;
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
  }): Promise<VerificationResultV2>;
  project(input: {
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
    verification: VerificationResultV2;
  }): unknown;
  attest(input: {
    execution: unknown;
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
  }): Promise<unknown>;
}

function safeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "VERIFIER_REJECTED";
}

export async function coordinateCapabilityProgramV2(
  input: CoordinateCapabilityInputV1,
  dependencies: CoordinateCapabilityDependenciesV2,
) {
  const job = await dependencies.programs.create(input.job);
  await dependencies.programs.start(job.id);
  let stage = "SANDBOX";
  try {
    const generated = await dependencies.runSandbox(input, job.id);
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
    await dependencies.programs.append(job.id, "execution", { version: 3, program: execution });
    await dependencies.programs.markVerified(job.id);

    stage = "ATTESTATION";
    const authorization = await dependencies.attest({
      execution,
      program: generated.program,
      evidence: generated.evidence,
    });
    await dependencies.programs.append(job.id, "authorization", authorization);
    await dependencies.programs.markAttested(job.id);
    return { jobId: job.id, program: generated.program, evidence: generated.evidence, execution, authorization };
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Capability program rejected:"))) {
      try {
        await dependencies.programs.fail(job.id, `${stage}_FAILED`);
      } catch (persistenceError) {
        throw new AggregateError([error, persistenceError],
          "Capability program failed and its failure state could not be persisted");
      }
    }
    throw error;
  }
}
