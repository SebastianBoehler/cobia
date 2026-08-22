import {
  CapabilityCompositionPolicyV1Schema, CapabilityCompositionSnapshotV1Schema,
  OpenIntentPolicyV3Schema, OpenIntentSnapshotV1Schema, parseSolverRunClaimV1,
  SolverRunClaimV1Schema, solverRunClaimCommitmentV1,
} from "@cobia/domain";
import { isAddress, isAddressEqual, recoverMessageAddress, type Address } from "viem";
import { z } from "zod";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);

interface RunIntakeDependencies {
  intents: { get(id: string): Promise<{ policy: unknown; state: string } | undefined> };
  snapshots: { get(id: string): Promise<{ snapshot: unknown; snapshotHash: string } | undefined> };
  profiles: { identity(id: string): Promise<{
    operatorKind: string; attestationAddress: string | null;
  } | undefined> };
  runs: {
    create(value: { intentId: string; solverId: string; revision: number;
      blockNumber: string; blockHash: `0x${string}` }): Promise<{ id: string }>;
    start(id: string): Promise<unknown>;
  };
  nowSec(): number;
}

export class InvalidSolverRunError extends Error {}
export class InvalidSolverRunSignatureError extends Error {}
export class SolverRunUnavailableError extends Error {}

function required<T>(value: T | null | undefined, message: string): T {
  if (!value) throw new SolverRunUnavailableError(message);
  return value;
}

function policy(value: unknown) {
  return value && typeof value === "object" && "kind" in value &&
    value.kind === "capability-composition"
    ? CapabilityCompositionPolicyV1Schema.parse(value) : OpenIntentPolicyV3Schema.parse(value);
}

function anchor(value: unknown) {
  if (value && typeof value === "object" && "kind" in value &&
      value.kind === "capability-composition") {
    const snapshot = CapabilityCompositionSnapshotV1Schema.parse(value);
    return { blockNumber: snapshot.route.blockNumber, blockHash: snapshot.route.blockHash };
  }
  const snapshot = OpenIntentSnapshotV1Schema.parse(value);
  return required(snapshot.anchors.find(({ chainId }) => chainId === 196),
    "X Layer anchor is unavailable");
}

export function createOpenRunIntakeV1(dependencies: RunIntakeDependencies) {
  return { async start(value: { claim: unknown; signature: string }) {
    const nowSec = dependencies.nowSec();
    let claim;
    try { claim = parseSolverRunClaimV1(SolverRunClaimV1Schema.parse(value.claim), nowSec); }
    catch { throw new InvalidSolverRunError("Solver run claim is invalid"); }
    const signature = SignatureSchema.parse(value.signature) as `0x${string}`;
    const intent = required(await dependencies.intents.get(claim.intentId), "Intent is unavailable");
    const parsedPolicy = policy(intent.policy);
    if (intent.state !== "collecting" || parsedPolicy.competition.closesAt <= nowSec ||
        claim.revision > parsedPolicy.competition.maxRevisionsPerSolver) {
      throw new SolverRunUnavailableError("Intent competition is closed");
    }
    const storedSnapshot = required(await dependencies.snapshots.get(claim.intentId),
      "Intent snapshot is unavailable");
    if (storedSnapshot.snapshotHash !== claim.snapshotHash) {
      throw new InvalidSolverRunError("Solver run snapshot mismatch");
    }
    const profile = required(await dependencies.profiles.identity(claim.solverId),
      "Solver identity is unavailable");
    if (profile.operatorKind !== "community" || !profile.attestationAddress) {
      throw new InvalidSolverRunError("Solver identity cannot start external runs");
    }
    const signer = await recoverMessageAddress({
      message: { raw: solverRunClaimCommitmentV1(claim) }, signature,
    });
    if (!isAddress(profile.attestationAddress) ||
        !isAddressEqual(signer, profile.attestationAddress as Address)) {
      throw new InvalidSolverRunSignatureError("Solver run signature mismatch");
    }
    const frozen = anchor(storedSnapshot.snapshot);
    const run = await dependencies.runs.create({
      intentId: claim.intentId, solverId: claim.solverId, revision: claim.revision,
      blockNumber: frozen.blockNumber, blockHash: frozen.blockHash,
    });
    await dependencies.runs.start(run.id);
    return { intentId: claim.intentId, solverId: claim.solverId,
      revision: claim.revision, state: "running" as const };
  } };
}
