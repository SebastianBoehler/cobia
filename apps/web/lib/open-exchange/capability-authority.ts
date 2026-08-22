import {
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";

export function deriveCapabilityAuthorityV2(policyValue: unknown, snapshotValue: unknown) {
  const policy = OpenIntentPolicyV3Schema.parse(policyValue);
  const snapshot = OpenIntentSnapshotV1Schema.parse(snapshotValue);
  const anchor = snapshot.anchors.find(({ chainId }) => chainId === 196);
  if (!anchor || policy.executionChainIds.length !== 1 || policy.executionChainIds[0] !== 196) {
    throw new Error("Capability execution requires a single X Layer anchor");
  }
  const manifest = productionCapabilityManifestV1();
  if (policy.outcomes.some(({ kind }) => kind === "x402-receipt")) {
    throw new Error("x402 outcomes require the staged transaction verifier");
  }
  const balanceConstraints = policy.outcomes.flatMap((outcome) =>
    outcome.kind === "minimum-final" || outcome.kind === "minimum-increase" ? [{
      kind: outcome.kind === "minimum-final" ? "minimumFinal" as const : "minimumIncrease" as const,
      token: outcome.token,
      atomic: outcome.atomic,
    }] : []);
  const predicates = policy.outcomes.flatMap((outcome) =>
    outcome.kind === "onchain-predicate" ? [outcome.predicate] : []);
  const derivedPolicy = GeneralIntentPolicyV2Schema.parse({
    version: 2,
    kind: "general-onchain",
    requestId: policy.requestId,
    displayGoal: policy.displayGoal,
    owner: policy.owner,
    executionChainId: 196,
    nonce: policy.nonce,
    createdAt: policy.createdAt,
    deadline: policy.deadline,
    competition: policy.competition,
    maxEvidenceAgeSec: policy.maxEvidenceAgeSec,
    manifestHash: commitment(manifest),
    input: { token: policy.inputs[0]!.token, maxAtomic: policy.inputs[0]!.maximumAtomic },
    allowedCapabilities: manifest.capabilities.map(({ id, version }) => ({ id, version }))
      .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`)),
    limits: {
      ...(policy.limits.minimumStages !== undefined
        ? { minimumActions: Math.min(policy.limits.minimumStages, 8) } : {}),
      maxActions: Math.min(policy.limits.maxStages, 8),
      maxApprovals: Math.min(policy.limits.maxApprovals, 16),
      maxActionCalldataBytes: Math.min(policy.limits.maxCalldataBytes, 16_384),
      maxExpectedGas: Math.min(20_000_000, Number(BigInt(policy.limits.maxGasPerTransaction) *
        BigInt(policy.limits.maxTransactions))),
    },
    forbiddenTargets: [...policy.forbiddenTargets].sort(),
    forbiddenAssets: [...policy.forbiddenAssets].sort(),
    balanceConstraints,
    predicates,
    objective: { kind: "satisfy" },
  });
  const derivedSnapshot = GeneralIntentSnapshotV1Schema.parse({
    version: 1,
    kind: "general-onchain",
    requestId: policy.requestId,
    chainId: 196,
    blockNumber: anchor.blockNumber,
    blockHash: anchor.blockHash,
    capturedAt: snapshot.capturedAt,
    manifestHash: derivedPolicy.manifestHash,
  });
  return { policy: derivedPolicy, snapshot: derivedSnapshot, manifest };
}
