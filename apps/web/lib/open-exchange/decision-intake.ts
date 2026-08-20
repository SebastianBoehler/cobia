import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  commitment,
  parseSolverDecisionClaimV1,
  SolverDecisionClaimV1Schema,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { SolverDecisionV1Schema } from "@cobia/solvers";
import { isAddress, isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import { z } from "zod";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value) => value as Hex);
const FailureCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

type IntakeReceipt = {
  intentId: string;
  solverId: string;
  revision: number;
  state: "accepted" | "rejected" | "abstained";
  submissionId?: string;
  errorCodes?: string[];
};

type Verification =
  | { accepted: true; errorCodes: readonly string[]; objective?: unknown; replay?: unknown;
      execution?: unknown; authorization?: unknown }
  | { accepted: false; errorCodes: string[]; replay?: unknown };

interface IntakeDependencies {
  intents: { get(id: string): Promise<{ policy: unknown; state: string } | undefined> };
  snapshots: { get(id: string): Promise<{ snapshot: unknown; snapshotHash: string } | undefined> };
  profiles: { identity(id: string): Promise<{
    id: string; operatorKind: string; attestationAddress: string | null;
    declaredCapabilities: unknown;
  } | undefined> };
  claims: { consume(value: { claim: unknown; signature: string; decision: unknown }): Promise<unknown> };
  runs: {
    create(value: { intentId: string; solverId: string; revision: number;
      blockNumber: string; blockHash: string }): Promise<{ id: string }>;
    start(id: string): Promise<unknown>;
    complete(id: string): Promise<unknown>;
    abstain(id: string): Promise<unknown>;
    fail(id: string, code: string): Promise<unknown>;
  };
  submissions: {
    append(value: { intentId: string; solverId: string; revision: number; programHash: string;
      validUntilSec: number; blockNumber: string; blockHash: string; observedAtSec: number }): Promise<{ id: string }>;
    appendArtifact(id: string, kind: string, value: unknown): Promise<unknown>;
    resolve(id: string, state: string, codes: string[]): Promise<unknown>;
  };
  verify(value: { runId: string; proposalKind: "capability-v2" | "transaction-program";
    policy: unknown; snapshot: unknown; program: unknown; evidence: unknown;
    providerArtifacts?: unknown; nowSec: number }): Promise<Verification>;
  nowSec(): number;
}

export class InvalidSolverDecisionError extends Error {}
export class InvalidSolverDecisionSignatureError extends Error {}
export class SolverDecisionUnavailableError extends Error {}

function required<T>(value: T | null | undefined, message: string): T {
  if (!value) throw new SolverDecisionUnavailableError(message);
  return value;
}

function capabilities(value: unknown): string[] {
  return z.array(z.string()).max(32).parse(value);
}

function assertDecisionAuthority(input: {
  decision: ReturnType<typeof SolverDecisionV1Schema.parse>;
  policy: ReturnType<typeof OpenIntentPolicyV3Schema.parse>;
}) {
  if (input.decision.decision === "abstain") return;
  if (input.decision.program.requestId !== input.policy.requestId ||
      !isAddressEqual(input.decision.program.owner, input.policy.owner) ||
      input.decision.evidence.programHash !== commitment(input.decision.program)) {
    throw new InvalidSolverDecisionError("Solver program does not match signed intent authority");
  }
  if (input.decision.proposalKind === "transaction-program") {
    const { program } = input.decision;
    if (program.policyHash !== commitment(input.policy)) {
      throw new InvalidSolverDecisionError("Transaction program does not match signed intent policy");
    }
    const declaredProviders = new Set(input.decision.providerArtifacts.artifacts.map(({ provider }) => provider));
    for (const stage of program.stages) {
      if ("provider" in stage && !declaredProviders.has(stage.provider)) {
        throw new InvalidSolverDecisionError("Solver provider artifact is unavailable");
      }
    }
  }
}

export function createOpenDecisionIntakeV1(dependencies: IntakeDependencies) {
  return {
    async submit(value: { claim: unknown; signature: string; decision: unknown }): Promise<IntakeReceipt> {
      const nowSec = dependencies.nowSec();
      let claim;
      try { claim = parseSolverDecisionClaimV1(SolverDecisionClaimV1Schema.parse(value.claim), nowSec); }
      catch { throw new InvalidSolverDecisionError("Solver decision claim is invalid"); }
      const signature = SignatureSchema.parse(value.signature);
      const decision = SolverDecisionV1Schema.parse(value.decision);
      if (claim.decisionHash !== commitment(decision)) {
        throw new InvalidSolverDecisionError("Solver decision commitment mismatch");
      }
      const intent = required(await dependencies.intents.get(claim.intentId), "Intent is unavailable");
      const policy = OpenIntentPolicyV3Schema.parse(intent.policy);
      if (intent.state !== "collecting" || policy.competition.closesAt <= nowSec ||
          claim.revision > policy.competition.maxRevisionsPerSolver) {
        throw new SolverDecisionUnavailableError("Intent competition is closed");
      }
      const storedSnapshot = required(
        await dependencies.snapshots.get(claim.intentId), "Intent snapshot is unavailable",
      );
      const snapshot = OpenIntentSnapshotV1Schema.parse(storedSnapshot.snapshot);
      if (storedSnapshot.snapshotHash !== commitment(snapshot) || claim.snapshotHash !== storedSnapshot.snapshotHash) {
        throw new InvalidSolverDecisionError("Solver decision snapshot mismatch");
      }
      const profile = required(await dependencies.profiles.identity(claim.solverId), "Solver identity is unavailable");
      if (profile.operatorKind !== "community" || !profile.attestationAddress) {
        throw new InvalidSolverDecisionError("Solver identity cannot submit external decisions");
      }
      const signer = await recoverMessageAddress({
        message: { raw: solverDecisionClaimCommitmentV1(claim) }, signature,
      });
      if (!isAddress(profile.attestationAddress) ||
          !isAddressEqual(signer, profile.attestationAddress as Address)) {
        throw new InvalidSolverDecisionSignatureError("Solver decision signature mismatch");
      }
      assertDecisionAuthority({ decision, policy });
      if (decision.decision === "submit") {
        const declared = new Set(capabilities(profile.declaredCapabilities));
        const undeclared = decision.proposalKind === "capability-v2"
          ? decision.program.actions.some((action) =>
            !declared.has(`${action.capabilityId}@${action.capabilityVersion}`))
          : decision.program.stages.some((stage) =>
            "provider" in stage && !declared.has(stage.provider));
        if (undeclared) {
          throw new InvalidSolverDecisionError("Solver used an undeclared capability");
        }
      }
      await dependencies.claims.consume({ claim, signature, decision });
      const anchor = required(snapshot.anchors.find(({ chainId }) => chainId === 196), "X Layer anchor is unavailable");
      const run = await dependencies.runs.create({
        intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
        blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
      });
      await dependencies.runs.start(run.id);
      if (decision.decision === "abstain") {
        await dependencies.runs.abstain(run.id);
        return { intentId: claim.intentId, solverId: claim.solverId,
          revision: claim.revision, state: "abstained" };
      }
      const submission = await dependencies.submissions.append({
        intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
        programHash: commitment(decision.program),
        validUntilSec: Math.min(decision.program.deadline, policy.competition.closesAt),
        blockNumber: anchor.blockNumber, blockHash: anchor.blockHash, observedAtSec: nowSec,
      });
      const artifacts: [string, unknown][] = [
        ["snapshot", snapshot], ["program", decision.program],
        ["evidence", decision.evidence], ["provenance", decision.provenance],
      ];
      if (decision.proposalKind === "transaction-program") {
        artifacts.splice(2, 0, ["provider", decision.providerArtifacts]);
      }
      for (const [kind, artifact] of artifacts) {
        await dependencies.submissions.appendArtifact(submission.id, kind, artifact);
      }
      let verdict: Verification;
      try {
        verdict = await dependencies.verify({ runId: run.id, proposalKind: decision.proposalKind,
          policy, snapshot, program: decision.program, evidence: decision.evidence,
          ...(decision.proposalKind === "transaction-program"
            ? { providerArtifacts: decision.providerArtifacts } : {}), nowSec });
      } catch (error) {
        console.error("Open solver verifier failed", {
          intentId: claim.intentId,
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        });
        await dependencies.submissions.resolve(submission.id, "failed", ["VERIFIER_FAILED"]);
        await dependencies.runs.fail(run.id, "VERIFIER_FAILED");
        throw new SolverDecisionUnavailableError("Independent verifier failed");
      }
      await dependencies.submissions.appendArtifact(submission.id, "verdict", verdict);
      if (verdict.replay) await dependencies.submissions.appendArtifact(submission.id, "replay", verdict.replay);
      if (!verdict.accepted) {
        const errorCodes = verdict.errorCodes.map((code) => FailureCodeSchema.parse(code));
        await dependencies.submissions.resolve(submission.id, "rejected", errorCodes);
        await dependencies.runs.fail(run.id, errorCodes[0] ?? "VERIFICATION_REJECTED");
        return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
          state: "rejected", submissionId: submission.id, errorCodes };
      }
      if (verdict.objective) {
        await dependencies.submissions.appendArtifact(submission.id, "objective", verdict.objective);
      }
      if (verdict.execution) {
        await dependencies.submissions.appendArtifact(submission.id, "execution", verdict.execution);
      }
      if (verdict.authorization) {
        await dependencies.submissions.appendArtifact(submission.id, "authorization", verdict.authorization);
      }
      await dependencies.submissions.resolve(submission.id, "verified", []);
      await dependencies.submissions.resolve(submission.id, "attested", []);
      await dependencies.runs.complete(run.id);
      return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
        state: "accepted", submissionId: submission.id };
    },
  };
}
