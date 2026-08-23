import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  GeneralAssetPolicyV1Schema,
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  commitment,
  parseSolverDecisionClaimV1,
  SolverDecisionClaimV1Schema,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema, SolverDecisionV1Schema } from "@cobia/solvers";
import { isAddress, isAddressEqual, recoverMessageAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { GeneralAssetAuthorizationArtifactsV4Schema } from "../execution-v4/authorization-artifact";
import { assertGeneralAssetArtifactIntegrityV4 } from "../execution-v4/artifact-integrity";
import { parseGeneralAssetExecutionBundleV4 } from "../execution-v4/stage-artifact";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value) => value as Hex);
const FailureCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const VerificationAnchorSchema = z.object({
  chainId: z.union([z.literal(1), z.literal(196)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash),
}).strict();

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
      execution?: unknown; authorization?: unknown; verificationValidUntilSec?: number;
      verificationAnchor?: unknown }
  | { accepted: false; errorCodes: string[]; replay?: unknown };

interface IntakeDependencies {
  intents: { get(id: string): Promise<{ policy: unknown; state: string;
    generalAssetEvidenceHash?: string | null; generalAssetEvidence?: unknown } | undefined> };
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
  verify(value: { runId: string;
    proposalKind: "capability-v2" | "transaction-program" | "general-asset-program";
    policy: unknown; snapshot: unknown | null; program: unknown; evidence: unknown;
    providerArtifacts?: unknown; manifest?: unknown; valuationEvidence?: unknown[];
    identityEvidence?: unknown[];
    anchors?: { chainId: 1 | 196; blockNumber: string; blockHash: string }[];
    nowSec: number }): Promise<Verification>;
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

function parsePolicy(value: unknown) {
  if (value && typeof value === "object" && "kind" in value) {
    if (value.kind === "capability-composition") return CapabilityCompositionPolicyV1Schema.parse(value);
    if (value.kind === "general-asset") return GeneralAssetPolicyV1Schema.parse(value);
  }
  return OpenIntentPolicyV3Schema.parse(value);
}

function parseSnapshot(value: unknown) {
  return value && typeof value === "object" && "kind" in value &&
    value.kind === "capability-composition"
    ? CapabilityCompositionSnapshotV1Schema.parse(value)
    : OpenIntentSnapshotV1Schema.parse(value);
}

function assertDecisionAuthority(input: {
  decision: ReturnType<typeof SolverDecisionV1Schema.parse>;
  policy: ReturnType<typeof parsePolicy>;
}) {
  if (input.decision.decision === "abstain") return;
  if (input.decision.proposalKind === "general-asset-program") {
    if (input.policy.kind !== "general-asset" ||
        input.decision.program.policyHash !== commitment(input.policy) ||
        !isAddressEqual(input.decision.program.owner, input.policy.owner) ||
        input.decision.program.manifestHash !== input.policy.manifestHash) {
      throw new InvalidSolverDecisionError("General asset program does not match signed intent authority");
    }
    return;
  }
  if (input.policy.kind === "general-asset") {
    throw new InvalidSolverDecisionError("General asset intents require general asset programs");
  }
  if (input.decision.program.requestId !== input.policy.requestId ||
      !isAddressEqual(input.decision.program.owner, input.policy.owner) ||
      input.decision.evidence.programHash !== commitment(input.decision.program)) {
    throw new InvalidSolverDecisionError("Solver program does not match signed intent authority");
  }
  if (input.decision.proposalKind === "transaction-program") {
    if (input.policy.kind === "capability-composition") {
      throw new InvalidSolverDecisionError("Composition intents require registered capability programs");
    }
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

function generalAssetAnchors(decision: Extract<
  ReturnType<typeof SolverDecisionV1Schema.parse>,
  { proposalKind: "general-asset-program" }
>) {
  const anchors = new Map<number, { chainId: 1 | 196; blockNumber: string; blockHash: string }>();
  for (const stage of decision.program.stages) {
    const identity = required(decision.evidence.identities.find((candidate) =>
      commitment(candidate) === stage.input.identityEvidenceHash &&
      candidate.chainId === stage.chainId && candidate.token === stage.input.token),
    "General asset stage input evidence is unavailable");
    const existing = anchors.get(stage.chainId);
    if (existing && (existing.blockNumber !== identity.blockNumber || existing.blockHash !== identity.blockHash)) {
      throw new InvalidSolverDecisionError("General asset evidence uses inconsistent chain anchors");
    }
    anchors.set(stage.chainId, { chainId: stage.chainId,
      blockNumber: identity.blockNumber, blockHash: identity.blockHash });
  }
  return [...anchors.values()].sort((left, right) => left.chainId - right.chainId);
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
      const policy = parsePolicy(intent.policy);
      if (intent.state !== "collecting" || policy.competition.closesAt <= nowSec ||
          claim.revision > policy.competition.maxRevisionsPerSolver) {
        throw new SolverDecisionUnavailableError("Intent competition is closed");
      }
      let snapshot: ReturnType<typeof parseSnapshot> | null = null;
      let generalAnchors: ReturnType<typeof generalAssetAnchors> = [];
      let anchor: { blockNumber: string; blockHash: string };
      if (policy.kind === "general-asset") {
        if (decision.decision !== "submit" || decision.proposalKind !== "general-asset-program") {
          throw new InvalidSolverDecisionError("General asset intents require a program evidence anchor");
        }
        const storedEvidence = GeneralAssetEvidenceArtifactV1Schema.safeParse(intent.generalAssetEvidence);
        if (!storedEvidence.success || !intent.generalAssetEvidenceHash ||
            intent.generalAssetEvidenceHash !== commitment(storedEvidence.data) ||
            commitment(decision.evidence) !== intent.generalAssetEvidenceHash ||
            claim.snapshotHash !== intent.generalAssetEvidenceHash) {
          throw new InvalidSolverDecisionError("Solver decision evidence commitment mismatch");
        }
        generalAnchors = generalAssetAnchors(decision);
        const sourceIdentity = required(decision.evidence.identities.find((identity) =>
          commitment(identity) === policy.inputIdentityHash && identity.chainId === policy.input.chainId &&
          identity.token === policy.input.token), "General asset input evidence is unavailable");
        anchor = { blockNumber: sourceIdentity.blockNumber, blockHash: sourceIdentity.blockHash };
      } else {
        const storedSnapshot = required(
          await dependencies.snapshots.get(claim.intentId), "Intent snapshot is unavailable",
        );
        snapshot = parseSnapshot(storedSnapshot.snapshot);
        if (snapshot.kind !== policy.kind) {
          throw new InvalidSolverDecisionError("Intent policy and snapshot kinds mismatch");
        }
        if (storedSnapshot.snapshotHash !== commitment(snapshot) ||
            claim.snapshotHash !== storedSnapshot.snapshotHash) {
          throw new InvalidSolverDecisionError("Solver decision snapshot mismatch");
        }
        anchor = snapshot.kind === "capability-composition"
          ? { blockNumber: snapshot.route.blockNumber, blockHash: snapshot.route.blockHash }
          : required(snapshot.anchors.find(({ chainId }) => chainId === 196),
            "X Layer anchor is unavailable");
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
        if (policy.kind === "capability-composition" &&
            !declared.has("policy.capability-composition@1")) {
          throw new InvalidSolverDecisionError("Solver did not declare composition policy support");
        }
        if (policy.kind === "general-asset" && !declared.has("general-asset@1")) {
          throw new InvalidSolverDecisionError("Solver did not declare general asset support");
        }
        const undeclared = decision.proposalKind === "capability-v2"
          ? decision.program.actions.some((action) =>
            !declared.has(`${action.capabilityId}@${action.capabilityVersion}`))
          : decision.proposalKind === "transaction-program"
            ? decision.program.stages.some((stage) =>
              "provider" in stage && !declared.has(stage.provider))
            : false;
        if (undeclared) {
          throw new InvalidSolverDecisionError("Solver used an undeclared capability");
        }
      }
      await dependencies.claims.consume({ claim, signature, decision });
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
        ["program", decision.program], ["evidence", decision.evidence],
        ["provenance", decision.provenance],
      ];
      if (snapshot) artifacts.unshift(["snapshot", snapshot]);
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
            ? { providerArtifacts: decision.providerArtifacts }
            : decision.proposalKind === "general-asset-program"
              ? { manifest: decision.evidence.manifest,
                valuationEvidence: decision.evidence.valuations,
                identityEvidence: decision.evidence.identities,
                anchors: generalAnchors }
              : {}), nowSec });
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
      let generalVerification: { validUntilSec: number;
        anchor: z.infer<typeof VerificationAnchorSchema> } | undefined;
      if (verdict.accepted && decision.proposalKind === "general-asset-program") {
        try {
          const execution = parseGeneralAssetExecutionBundleV4(verdict.execution);
          const authorization = GeneralAssetAuthorizationArtifactsV4Schema.parse(verdict.authorization);
          const anchor = VerificationAnchorSchema.parse(verdict.verificationAnchor);
          assertGeneralAssetArtifactIntegrityV4(execution, authorization, anchor);
          const validUntilSec = z.number().int().positive().safe()
            .parse(verdict.verificationValidUntilSec);
          if (execution.programId !== decision.program.canonicalProgramHash ||
              execution.stages.length !== decision.program.stages.length ||
              authorization.length !== decision.program.stages.length ||
              authorization.some((item, index) => item.chainId !== decision.program.stages[index]!.chainId) ||
              execution.deadline !== validUntilSec || validUntilSec <= dependencies.nowSec()) {
            throw new Error("General asset execution artifact mismatch");
          }
          generalVerification = { validUntilSec, anchor };
        } catch { generalVerification = undefined; }
      }
      if (verdict.accepted && decision.proposalKind === "general-asset-program" && !generalVerification) {
        const errorCodes = ["EXECUTION_ARTIFACT_MISSING"];
        await dependencies.submissions.resolve(submission.id, "rejected", errorCodes);
        await dependencies.runs.fail(run.id, errorCodes[0]!);
        return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
          state: "rejected", submissionId: submission.id, errorCodes };
      }
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
      if (generalVerification) {
        if (dependencies.nowSec() >= generalVerification.validUntilSec) {
          const errorCodes = ["VERIFICATION_EXPIRED"];
          await dependencies.submissions.resolve(submission.id, "rejected", errorCodes);
          await dependencies.runs.fail(run.id, errorCodes[0]!);
          return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
            state: "rejected", submissionId: submission.id, errorCodes };
        }
      }
      await dependencies.submissions.resolve(submission.id, "verified", []);
      if (generalVerification && dependencies.nowSec() >= generalVerification.validUntilSec) {
        const errorCodes = ["VERIFICATION_EXPIRED"];
        await dependencies.submissions.resolve(submission.id, "failed", errorCodes);
        await dependencies.runs.fail(run.id, errorCodes[0]!);
        return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
          state: "rejected", submissionId: submission.id, errorCodes };
      }
      await dependencies.submissions.resolve(submission.id, "attested", []);
      await dependencies.runs.complete(run.id);
      return { intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
        state: "accepted", submissionId: submission.id };
    },
  };
}
