import { commitment } from "@cobia/domain";
import type {
  CapabilityProgramEvidenceV2,
  CapabilityProgramV2,
  CapabilitySandboxProvenanceV2,
  CompiledCapabilityActionV1,
} from "@cobia/solvers";
import type { CoordinateCapabilityInputV1 } from "./coordinator";

type ArtifactKind =
  | "snapshot" | "program" | "evidence" | "provenance" | "verdict"
  | "replay" | "execution" | "authorization";

interface RunStore {
  create(input: {
    intentId: string; solverId: string; revision: number;
    blockNumber: string; blockHash: `0x${string}`;
  }): Promise<{ id: string }>;
  start(id: string): Promise<unknown>;
  complete(id: string): Promise<unknown>;
  abstain(id: string): Promise<unknown>;
  fail(id: string, code: string): Promise<unknown>;
}

interface SubmissionStore {
  append(input: {
    intentId: string; solverId: string; revision: number; programHash: `0x${string}`;
    validUntilSec: number; blockNumber: string; blockHash: `0x${string}`; observedAtSec: number;
  }): Promise<{ id: string }>;
  appendArtifact(id: string, kind: ArtifactKind, payload: unknown): Promise<unknown>;
  resolve(id: string, state: "rejected" | "verified" | "attested" | "failed", codes: string[]): Promise<unknown>;
}

interface VerificationResult {
  accepted: boolean;
  errorCodes: readonly string[];
  compiled: readonly CompiledCapabilityActionV1[];
  replay?: unknown;
}

export interface CompetitionCoordinateInput extends CoordinateCapabilityInputV1 {
  job: CoordinateCapabilityInputV1["job"] & { blockHash: `0x${string}` };
  solverId: string;
  revision: number;
  observedAtSec: number;
  validUntilSec: number;
}

export interface CompetitionCoordinateDependencies {
  runs: RunStore;
  submissions: SubmissionStore;
  runSandbox(input: CoordinateCapabilityInputV1, runId: string): Promise<{
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
    provenance: CapabilitySandboxProvenanceV2;
  } | null>;
  verify(input: {
    runId: string;
    policy: unknown; snapshot: unknown;
    portfolio: CoordinateCapabilityInputV1["portfolio"];
    manifest: unknown; program: CapabilityProgramV2; evidence: CapabilityProgramEvidenceV2;
  }): Promise<VerificationResult>;
  project(input: {
    program: CapabilityProgramV2;
    evidence: CapabilityProgramEvidenceV2;
    verification: VerificationResult;
  }): unknown;
  attest(input: {
    execution: unknown; program: CapabilityProgramV2; evidence: CapabilityProgramEvidenceV2;
  }): Promise<unknown>;
}

function safeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "SOLVER_RUN_FAILED";
}

export async function coordinateCompetitionProgram(
  input: CompetitionCoordinateInput,
  dependencies: CompetitionCoordinateDependencies,
) {
  const run = await dependencies.runs.create({
    intentId: input.job.requestId, solverId: input.solverId, revision: input.revision,
    blockNumber: input.job.blockNumber, blockHash: input.job.blockHash,
  });
  await dependencies.runs.start(run.id);
  let stage = "SANDBOX";
  let submissionId: string | undefined;
  try {
    const generated = await dependencies.runSandbox(input, run.id);
    if (!generated) {
      await dependencies.runs.abstain(run.id);
      return { status: "abstained" as const, runId: run.id };
    }
    const submission = await dependencies.submissions.append({
      intentId: input.job.requestId, solverId: input.solverId, revision: input.revision,
      programHash: commitment(generated.program), validUntilSec: input.validUntilSec,
      blockNumber: input.job.blockNumber, blockHash: input.job.blockHash,
      observedAtSec: input.observedAtSec,
    });
    submissionId = submission.id;
    await dependencies.submissions.appendArtifact(submission.id, "snapshot", input.snapshot);
    await dependencies.submissions.appendArtifact(submission.id, "program", generated.program);
    await dependencies.submissions.appendArtifact(submission.id, "evidence", generated.evidence);
    await dependencies.submissions.appendArtifact(submission.id, "provenance", generated.provenance);

    stage = "VERIFIER";
    const verification = await dependencies.verify({
      runId: run.id,
      policy: input.policy, snapshot: input.snapshot, portfolio: input.portfolio,
      manifest: input.manifest, program: generated.program, evidence: generated.evidence,
    });
    await dependencies.submissions.appendArtifact(submission.id, "verdict", {
      accepted: verification.accepted, errorCodes: verification.errorCodes,
    });
    if (!verification.accepted || verification.errorCodes.length > 0 || !verification.replay) {
      const codes = verification.errorCodes.length > 0
        ? verification.errorCodes.map(safeCode) : ["REPLAY_MISSING"];
      await dependencies.submissions.resolve(submission.id, "rejected", codes);
      await dependencies.runs.complete(run.id);
      return { status: "rejected" as const, runId: run.id, submissionId: submission.id, errorCodes: codes };
    }
    await dependencies.submissions.appendArtifact(submission.id, "replay", verification.replay);

    stage = "PROJECTION";
    const execution = dependencies.project({
      program: generated.program, evidence: generated.evidence, verification,
    });
    await dependencies.submissions.appendArtifact(submission.id, "execution", execution);
    await dependencies.submissions.resolve(submission.id, "verified", []);

    stage = "ATTESTATION";
    const authorization = await dependencies.attest({
      execution, program: generated.program, evidence: generated.evidence,
    });
    await dependencies.submissions.appendArtifact(submission.id, "authorization", authorization);
    await dependencies.submissions.resolve(submission.id, "attested", []);
    await dependencies.runs.complete(run.id);
    return {
      status: "attested" as const, runId: run.id, submissionId: submission.id,
      program: generated.program, evidence: generated.evidence, execution, authorization,
    };
  } catch (error) {
    const code = safeCode(`${stage}_FAILED`);
    const persistenceErrors: unknown[] = [];
    if (submissionId) {
      try { await dependencies.submissions.resolve(submissionId, "failed", [code]); }
      catch (cause) { persistenceErrors.push(cause); }
    }
    try { await dependencies.runs.fail(run.id, code); }
    catch (cause) { persistenceErrors.push(cause); }
    if (persistenceErrors.length > 0) {
      throw new AggregateError([error, ...persistenceErrors],
        "Solver run failed and its failure state could not be persisted");
    }
    throw error;
  }
}
