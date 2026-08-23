import { GeneralAssetPolicyV1Schema, commitment, type GeneralAssetPolicyV1 } from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema, SolverDecisionV1Schema,
  type GeneralAssetEvidenceArtifactV1 } from "@cobia/solvers";
import type { Address } from "viem";
import { cobiaCodingAgentProfile } from "../runtime/solver-catalog";
import { validateGeneralAssetSolutionV1, type GeneralAssetSolutionVerdictV1 } from
  "./validate-general-asset-solution";

type ArtifactKind = "program" | "evidence" | "provenance" | "verdict" |
  "replay" | "execution" | "authorization";

interface Dependencies {
  executor: Address;
  assertReady(input: { policy: GeneralAssetPolicyV1;
    evidence: GeneralAssetEvidenceArtifactV1 }): Promise<void>;
  publish(input: { policy: GeneralAssetPolicyV1; ownerSignature: `0x${string}`;
    generalAssetEvidence: GeneralAssetEvidenceArtifactV1 }): Promise<unknown>;
  profiles: { register(input: typeof cobiaCodingAgentProfile): Promise<unknown> };
  runs: {
    create(input: { intentId: string; solverId: string; revision: number;
      blockNumber: string; blockHash: string }): Promise<{ id: string }>;
    start(id: string): Promise<unknown>;
    complete(id: string): Promise<unknown>;
    fail(id: string, code: string): Promise<unknown>;
  };
  submissions: {
    append(input: { intentId: string; solverId: string; revision: number;
      programHash: string; validUntilSec: number; blockNumber: string;
      blockHash: string; observedAtSec: number }): Promise<{ id: string }>;
    appendArtifact(id: string, kind: ArtifactKind, value: unknown): Promise<unknown>;
    resolve(id: string, state: "rejected" | "verified" | "attested" | "failed",
      codes: string[]): Promise<unknown>;
  };
  build(input: { policy: GeneralAssetPolicyV1;
    evidence: GeneralAssetEvidenceArtifactV1 }): Promise<unknown>;
  verify(input: { runId: string; policy: GeneralAssetPolicyV1; program: unknown;
    evidence: GeneralAssetEvidenceArtifactV1; nowSec: number }): Promise<GeneralAssetSolutionVerdictV1>;
  nowSec(): number;
}

function failureCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "GENERAL_ASSET_SOLVER_FAILED";
}

function assertDecision(policy: GeneralAssetPolicyV1, evidence: GeneralAssetEvidenceArtifactV1,
  value: unknown) {
  const decision = SolverDecisionV1Schema.parse(value);
  if (decision.decision !== "submit" || decision.proposalKind !== "general-asset-program" ||
      decision.program.policyHash !== commitment(policy) ||
      decision.program.manifestHash !== policy.manifestHash ||
      decision.program.owner !== policy.owner ||
      commitment(decision.evidence) !== commitment(evidence)) {
    throw new Error("Internal solver decision does not match the signed general asset intent");
  }
  return decision;
}

export async function publishAndRunGeneralAssetSolverV1(input: {
  policy: unknown;
  ownerSignature: `0x${string}`;
  evidence: unknown;
  revision: number;
  nowSec: number;
}, deps: Dependencies) {
  const policy = GeneralAssetPolicyV1Schema.parse(input.policy);
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.evidence);
  await deps.assertReady({ policy, evidence });

  const decision = assertDecision(policy, evidence, await deps.build({ policy, evidence }));
  const verdict = await deps.verify({ runId: policy.requestId, policy,
    program: decision.program, evidence: decision.evidence, nowSec: input.nowSec });
  const preflight = validateGeneralAssetSolutionV1({ verdict, policy, program: decision.program,
    baselineEvidence: decision.evidence, executor: deps.executor, nowSec: deps.nowSec() });

  const intent = await deps.publish({ policy, ownerSignature: input.ownerSignature,
    generalAssetEvidence: evidence });
  await deps.profiles.register(cobiaCodingAgentProfile);
  const run = await deps.runs.create({ intentId: policy.requestId,
    solverId: cobiaCodingAgentProfile.id, revision: input.revision,
    blockNumber: preflight.anchor.blockNumber, blockHash: preflight.anchor.blockHash });
  await deps.runs.start(run.id);
  let submissionId: string | undefined;
  try {
    if (deps.nowSec() >= preflight.validUntilSec) {
      throw new Error("General asset solution verification expired before persistence");
    }
    const submission = await deps.submissions.append({
      intentId: policy.requestId, solverId: cobiaCodingAgentProfile.id,
      revision: input.revision, programHash: commitment(decision.program),
      validUntilSec: preflight.validUntilSec, blockNumber: preflight.anchor.blockNumber,
      blockHash: preflight.anchor.blockHash, observedAtSec: deps.nowSec(),
    });
    submissionId = submission.id;
    const artifacts: Array<[ArtifactKind, unknown]> = [
      ["program", decision.program], ["evidence", decision.evidence],
      ["provenance", decision.provenance], ["verdict", verdict],
      ["replay", preflight.replay], ["execution", preflight.execution],
      ["authorization", preflight.authorization],
    ];
    for (const [kind, value] of artifacts) {
      await deps.submissions.appendArtifact(submission.id, kind, value);
    }
    if (deps.nowSec() >= preflight.validUntilSec) {
      throw new Error("General asset solution verification expired before attestation");
    }
    await deps.submissions.resolve(submission.id, "verified", []);
    if (deps.nowSec() >= preflight.validUntilSec) {
      throw new Error("General asset solution verification expired before attestation");
    }
    await deps.submissions.resolve(submission.id, "attested", []);
    await deps.runs.complete(run.id);
    return { intent, solution: { state: "attested" as const,
      runId: run.id, submissionId: submission.id } };
  } catch (error) {
    const code = failureCode(error instanceof Error && /expired/i.test(error.message)
      ? "VERIFICATION_EXPIRED" : "PERSISTENCE_FAILED");
    const persistenceErrors: unknown[] = [];
    if (submissionId) {
      try { await deps.submissions.resolve(submissionId, "failed", [code]); }
      catch (cause) { persistenceErrors.push(cause); }
    }
    try { await deps.runs.fail(run.id, code); }
    catch (cause) { persistenceErrors.push(cause); }
    if (persistenceErrors.length > 0) {
      throw new AggregateError([error, ...persistenceErrors],
        "General asset solver failed and its failure state could not be persisted");
    }
    throw error;
  }
}
