import {
  GeneralAssetPolicyV1Schema,
  commitment,
  type GeneralAssetPolicyV1,
} from "@cobia/domain";
import {
  GeneralAssetEvidenceArtifactV1Schema,
  SolverDecisionV1Schema,
  type GeneralAssetEvidenceArtifactV1,
} from "@cobia/solvers";
import { cobiaCodingAgentProfile } from "../runtime/solver-catalog";

type ArtifactKind = "program" | "evidence" | "provenance" | "verdict" |
  "replay" | "execution" | "authorization";

interface Dependencies {
  assertReady(input: {
    policy: GeneralAssetPolicyV1;
    evidence: GeneralAssetEvidenceArtifactV1;
  }): Promise<void>;
  publish(input: {
    policy: GeneralAssetPolicyV1;
    ownerSignature: `0x${string}`;
    generalAssetEvidence: GeneralAssetEvidenceArtifactV1;
  }): Promise<unknown>;
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
  build(input: {
    policy: GeneralAssetPolicyV1;
    evidence: GeneralAssetEvidenceArtifactV1;
  }): Promise<unknown>;
  verify(input: { runId: string; policy: GeneralAssetPolicyV1;
    program: unknown; evidence: GeneralAssetEvidenceArtifactV1; nowSec: number }): Promise<{
      accepted: boolean;
      errorCodes: readonly string[];
      replay?: unknown;
      execution?: unknown;
      authorization?: unknown;
      verificationValidUntilSec?: number;
    }>;
  nowSec(): number;
}

function failureCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : "GENERAL_ASSET_SOLVER_FAILED";
}

function sourceAnchor(policy: GeneralAssetPolicyV1, evidence: GeneralAssetEvidenceArtifactV1) {
  const identity = evidence.identities.find((value) =>
    commitment(value) === policy.inputIdentityHash && value.chainId === policy.input.chainId &&
    value.token === policy.input.token);
  if (!identity) throw new Error("General asset source anchor is unavailable");
  return { blockNumber: identity.blockNumber, blockHash: identity.blockHash };
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
  const intent = await deps.publish({ policy, ownerSignature: input.ownerSignature,
    generalAssetEvidence: evidence });
  await deps.profiles.register(cobiaCodingAgentProfile);

  const anchor = sourceAnchor(policy, evidence);
  const run = await deps.runs.create({ intentId: policy.requestId,
    solverId: cobiaCodingAgentProfile.id, revision: input.revision, ...anchor });
  await deps.runs.start(run.id);
  let submissionId: string | undefined;
  let stage = "BUILD";
  try {
    const decision = SolverDecisionV1Schema.parse(await deps.build({ policy, evidence }));
    if (decision.decision !== "submit" || decision.proposalKind !== "general-asset-program" ||
        decision.program.policyHash !== commitment(policy) ||
        decision.program.manifestHash !== policy.manifestHash ||
        decision.program.owner !== policy.owner || commitment(decision.evidence) !== commitment(evidence)) {
      throw new Error("Internal solver decision does not match the signed general asset intent");
    }
    const submission = await deps.submissions.append({
      intentId: policy.requestId,
      solverId: cobiaCodingAgentProfile.id,
      revision: input.revision,
      programHash: commitment(decision.program),
      validUntilSec: Math.min(decision.program.deadline, policy.competition.closesAt),
      ...anchor,
      observedAtSec: input.nowSec,
    });
    submissionId = submission.id;
    await deps.submissions.appendArtifact(submission.id, "program", decision.program);
    await deps.submissions.appendArtifact(submission.id, "evidence", decision.evidence);
    await deps.submissions.appendArtifact(submission.id, "provenance", decision.provenance);

    stage = "VERIFY";
    const verdict = await deps.verify({ runId: run.id, policy,
      program: decision.program, evidence: decision.evidence, nowSec: input.nowSec });
    await deps.submissions.appendArtifact(submission.id, "verdict", verdict);
    const verificationExpired = !Number.isSafeInteger(verdict.verificationValidUntilSec) ||
      verdict.verificationValidUntilSec! <= deps.nowSec();
    if (!verdict.accepted || verdict.errorCodes.length > 0 || !verdict.replay ||
        !verdict.execution || !verdict.authorization || verificationExpired) {
      const errorCodes = verdict.errorCodes.length > 0
        ? verdict.errorCodes.map(failureCode)
        : verificationExpired ? ["VERIFICATION_EXPIRED"] : ["EXECUTION_ARTIFACT_MISSING"];
      await deps.submissions.resolve(submission.id, "rejected", errorCodes);
      await deps.runs.fail(run.id, errorCodes[0]!);
      return { intent, solution: { state: "rejected" as const,
        runId: run.id, submissionId: submission.id, errorCodes } };
    }
    await deps.submissions.appendArtifact(submission.id, "replay", verdict.replay);
    await deps.submissions.appendArtifact(submission.id, "execution", verdict.execution);
    await deps.submissions.appendArtifact(submission.id, "authorization", verdict.authorization);
    if (deps.nowSec() >= verdict.verificationValidUntilSec!) {
      const errorCodes = ["VERIFICATION_EXPIRED"];
      await deps.submissions.resolve(submission.id, "rejected", errorCodes);
      await deps.runs.fail(run.id, errorCodes[0]!);
      return { intent, solution: { state: "rejected" as const,
        runId: run.id, submissionId: submission.id, errorCodes } };
    }
    await deps.submissions.resolve(submission.id, "verified", []);
    if (deps.nowSec() >= verdict.verificationValidUntilSec!) {
      const errorCodes = ["VERIFICATION_EXPIRED"];
      await deps.submissions.resolve(submission.id, "failed", errorCodes);
      await deps.runs.fail(run.id, errorCodes[0]!);
      return { intent, solution: { state: "failed" as const,
        runId: run.id, submissionId: submission.id, errorCodes } };
    }
    await deps.submissions.resolve(submission.id, "attested", []);
    await deps.runs.complete(run.id);
    return { intent, solution: { state: "attested" as const,
      runId: run.id, submissionId: submission.id } };
  } catch (error) {
    const code = failureCode(`${stage}_FAILED`);
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
