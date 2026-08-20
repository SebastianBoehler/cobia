import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  TransactionProgramV1Schema,
  commitment,
} from "@cobia/domain";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { TransactionProgramEvidenceV1Schema, type TransactionProgramEvidenceV1 } from "./evidence";
import { ProviderArtifactsV1Schema, type ProviderArtifactV1 } from "./provider-artifacts";

export type OpenProgramRejectionCodeV1 =
  | "ALLOWANCE_EXPANDED" | "ANCHOR_MISMATCH" | "CODE_IDENTITY_CHANGED"
  | "CODE_IDENTITY_MISSING" | "EVIDENCE_INVALID" | "FORBIDDEN_ASSET"
  | "FORBIDDEN_TARGET" | "GAS_LIMIT_EXCEEDED" | "INPUT_LIMIT_EXCEEDED"
  | "LIMIT_EXCEEDED" | "OUTCOME_NOT_REPRODUCED" | "POLICY_MISMATCH"
  | "PROGRAM_INVALID" | "PROVIDER_ARTIFACT_INVALID" | "PROVIDER_VERIFICATION_FAILED"
  | "REPLAY_MISMATCH" | "STALE_EVIDENCE"
  | "UNDECLARED_ASSET_DECREASE" | "UNSUPPORTED_STAGE";

interface UnsignedCallV1 { to: Address; data: Hex; value: Hex }
interface StageAuthorizationV1 {
  stageId: string;
  chainId: 1 | 196 | 8453;
  calls: UnsignedCallV1[];
}
type ProviderVerificationV1 =
  | { accepted: true; calls: UnsignedCallV1[] }
  | { accepted: false; errorCodes: string[] };

interface VerifiedReplayV1 {
  reproduced: boolean;
  simulations: TransactionProgramEvidenceV1["simulations"];
}

function rejection(errors: Set<OpenProgramRejectionCodeV1>) {
  return { accepted: false as const, errorCodes: [...errors].sort() };
}

function key(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function add(map: Map<string, bigint>, entry: string, value: bigint) {
  map.set(entry, (map.get(entry) ?? 0n) + value);
}

export async function verifyOpenTransactionProgramV1(input: {
  policy: unknown;
  snapshot: unknown;
  program: unknown;
  evidence: unknown;
  providerArtifacts: unknown;
  nowSec: number;
  confirmAnchor(anchor: { chainId: 1 | 196 | 8453; blockNumber: string; blockHash: Hash }): Promise<boolean>;
  getCodeHash(chainId: 1 | 196 | 8453, address: Address, blockNumber: string): Promise<Hash | undefined>;
  verifyProviderStage(input: {
    stage: Extract<ReturnType<typeof TransactionProgramV1Schema.parse>["stages"][number],
      { kind: "wallet-transaction" }>;
    artifact: ProviderArtifactV1;
    anchor: { chainId: 1 | 196 | 8453; blockNumber: string; blockHash: Hash };
  }): Promise<ProviderVerificationV1>;
  replay(input: {
    program: unknown;
    evidence: TransactionProgramEvidenceV1;
    providerArtifacts: ReturnType<typeof ProviderArtifactsV1Schema.parse>;
  }): Promise<VerifiedReplayV1>;
}) {
  let policy: ReturnType<typeof OpenIntentPolicyV3Schema.parse>;
  let snapshot: ReturnType<typeof OpenIntentSnapshotV1Schema.parse>;
  let program: ReturnType<typeof TransactionProgramV1Schema.parse>;
  let evidence: TransactionProgramEvidenceV1;
  let providerArtifacts: ReturnType<typeof ProviderArtifactsV1Schema.parse>;
  try {
    policy = OpenIntentPolicyV3Schema.parse(input.policy);
    snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
    program = TransactionProgramV1Schema.parse(input.program);
    evidence = TransactionProgramEvidenceV1Schema.parse(input.evidence);
    providerArtifacts = ProviderArtifactsV1Schema.parse(input.providerArtifacts);
  } catch {
    return rejection(new Set(["PROGRAM_INVALID"]));
  }
  const errors = new Set<OpenProgramRejectionCodeV1>();
  if (snapshot.requestId !== policy.requestId || program.requestId !== policy.requestId ||
      program.policyHash !== commitment(policy) || !isAddressEqual(program.owner, policy.owner) ||
      program.deadline > policy.deadline || program.maxEvidenceAgeSec > policy.maxEvidenceAgeSec) {
    errors.add("POLICY_MISMATCH");
  }
  const expectedChains = commitment(policy.executionChainIds);
  if (commitment(snapshot.anchors.map(({ chainId }) => chainId)) !== expectedChains) errors.add("ANCHOR_MISMATCH");
  if (evidence.programHash !== commitment(program)) errors.add("EVIDENCE_INVALID");
  const capturedAt = Math.floor(Date.parse(snapshot.capturedAt) / 1_000);
  if (input.nowSec >= program.deadline || evidence.capturedAt > input.nowSec ||
      input.nowSec - evidence.capturedAt > policy.maxEvidenceAgeSec ||
      input.nowSec - capturedAt > policy.maxEvidenceAgeSec) errors.add("STALE_EVIDENCE");

  const walletStages = program.stages.filter((stage) => stage.kind === "wallet-transaction");
  if (program.stages.some((stage) => !["wallet-transaction", "research"].includes(stage.kind))) {
    errors.add("UNSUPPORTED_STAGE");
  }
  const approvalCount = walletStages.filter(({ approval }) => approval).length;
  if (program.stages.length > policy.limits.maxStages || walletStages.length > policy.limits.maxTransactions ||
      approvalCount > policy.limits.maxApprovals) errors.add("LIMIT_EXCEEDED");
  const nativeValues = new Map<number, bigint>();
  const providerByStage = new Map(providerArtifacts.artifacts.map((artifact) => [artifact.stageId, artifact]));
  if (providerArtifacts.artifacts.length !== walletStages.length) errors.add("PROVIDER_ARTIFACT_INVALID");
  const stageAuthorizations: StageAuthorizationV1[] = [];
  for (const stage of walletStages) {
    nativeValues.set(
      stage.chainId,
      (nativeValues.get(stage.chainId) ?? 0n) + BigInt(stage.transaction.valueAtomic),
    );
    if (policy.forbiddenTargets.includes(stage.transaction.target) ||
        (stage.approval && policy.forbiddenTargets.includes(stage.approval.spender))) errors.add("FORBIDDEN_TARGET");
    if (policy.forbiddenAssets.includes(stage.input.token) || policy.forbiddenAssets.includes(stage.output.token)) {
      errors.add("FORBIDDEN_ASSET");
    }
    const artifact = providerByStage.get(stage.id);
    const anchor = snapshot.anchors.find(({ chainId }) => chainId === stage.chainId);
    if (!artifact || artifact.provider !== stage.provider || !anchor) {
      errors.add("PROVIDER_ARTIFACT_INVALID");
    } else {
      const verification = await input.verifyProviderStage({ stage, artifact, anchor });
      if (!verification.accepted) errors.add("PROVIDER_VERIFICATION_FAILED");
      else stageAuthorizations.push({ stageId: stage.id, chainId: stage.chainId, calls: verification.calls });
    }
  }
  for (const bound of policy.limits.maxNativeValueAtomicByChain) {
    if ((nativeValues.get(bound.chainId) ?? 0n) > BigInt(bound.atomic)) errors.add("LIMIT_EXCEEDED");
  }

  const simulationByStage = new Map(evidence.simulations.map((item) => [item.stageId, item]));
  const aggregateDeltas = new Map<string, bigint>();
  const finalBalances = new Map<string, bigint>();
  const declaredInputs = new Map(policy.inputs.map((item) => [key(item.chainId, item.token), BigInt(item.maximumAtomic)]));
  for (const stage of walletStages) {
    const simulation = simulationByStage.get(stage.id);
    const anchor = snapshot.anchors.find(({ chainId }) => chainId === stage.chainId);
    if (!simulation || !anchor || simulation.chainId !== stage.chainId ||
        simulation.blockNumber !== anchor.blockNumber || simulation.blockHash !== anchor.blockHash ||
        simulation.transactionDataHash !== stage.transaction.dataHash || !simulation.success ||
        !simulation.completeAssetCoverage) {
      errors.add("EVIDENCE_INVALID");
      continue;
    }
    if (simulation.calldataBytes > policy.limits.maxCalldataBytes ||
        BigInt(simulation.gasUsed) > BigInt(policy.limits.maxGasPerTransaction)) errors.add("GAS_LIMIT_EXCEEDED");
    for (const delta of simulation.assetDeltas) {
      if (BigInt(delta.afterAtomic) - BigInt(delta.beforeAtomic) !== BigInt(delta.deltaAtomic)) {
        errors.add("EVIDENCE_INVALID");
      }
      if (isAddressEqual(delta.account, policy.owner)) {
        const assetKey = key(stage.chainId, delta.token);
        add(aggregateDeltas, assetKey, BigInt(delta.deltaAtomic));
        finalBalances.set(assetKey, BigInt(delta.afterAtomic));
      }
    }
    for (const allowance of simulation.allowanceDeltas) {
      if (isAddressEqual(allowance.owner, policy.owner) &&
          BigInt(allowance.afterAtomic) > BigInt(allowance.beforeAtomic)) errors.add("ALLOWANCE_EXPANDED");
    }
    const required = new Set([stage.transaction.target, stage.input.token, stage.output.token,
      ...(stage.approval ? [stage.approval.spender] : [])].map((value) => value.toLowerCase()));
    for (const address of required) {
      const identity = simulation.codeIdentities.find((item) => item.address === address);
      if (!identity) { errors.add("CODE_IDENTITY_MISSING"); continue; }
      if (await input.getCodeHash(stage.chainId, identity.address, anchor.blockNumber) !== identity.runtimeCodeHash ||
          (identity.implementation && await input.getCodeHash(
            stage.chainId, identity.implementation.address, anchor.blockNumber,
          ) !== identity.implementation.runtimeCodeHash)) errors.add("CODE_IDENTITY_CHANGED");
    }
  }
  if (evidence.simulations.length !== walletStages.length) errors.add("EVIDENCE_INVALID");
  for (const [asset, delta] of aggregateDeltas) {
    if (delta >= 0n) continue;
    const maximum = declaredInputs.get(asset);
    if (maximum === undefined) errors.add("UNDECLARED_ASSET_DECREASE");
    else if (-delta > maximum) errors.add("INPUT_LIMIT_EXCEEDED");
  }
  for (const outcome of policy.outcomes) {
    if (outcome.kind === "minimum-increase" || outcome.kind === "registered-instrument") {
      const minimum = outcome.kind === "registered-instrument" ? outcome.minimumIncreaseAtomic : outcome.atomic;
      if ((aggregateDeltas.get(key(outcome.chainId, outcome.token)) ?? 0n) < BigInt(minimum)) {
        errors.add("OUTCOME_NOT_REPRODUCED");
      }
    } else if (outcome.kind === "minimum-final") {
      if ((finalBalances.get(key(outcome.chainId, outcome.token)) ?? 0n) < BigInt(outcome.atomic)) {
        errors.add("OUTCOME_NOT_REPRODUCED");
      }
    } else errors.add("OUTCOME_NOT_REPRODUCED");
  }
  const onlyOutcome = policy.outcomes.length === 1 ? policy.outcomes[0] : undefined;
  const measuredAtomic = onlyOutcome?.kind === "minimum-increase" || onlyOutcome?.kind === "registered-instrument"
    ? aggregateDeltas.get(key(onlyOutcome.chainId, onlyOutcome.token))
    : onlyOutcome?.kind === "minimum-final"
      ? finalBalances.get(key(onlyOutcome.chainId, onlyOutcome.token)) : undefined;
  const objective = measuredAtomic === undefined ? undefined : {
    version: 1 as const,
    kind: "atomic-value" as const,
    direction: "maximize" as const,
    atomic: measuredAtomic.toString(),
  };
  for (const anchor of snapshot.anchors) {
    if (!(await input.confirmAnchor(anchor))) errors.add("ANCHOR_MISMATCH");
  }
  const replay = await input.replay({ program, evidence, providerArtifacts });
  if (!replay.reproduced || commitment(replay.simulations) !== commitment(evidence.simulations)) {
    errors.add("REPLAY_MISMATCH");
  }
  if (errors.size) return rejection(errors);
  return { accepted: true as const, errorCodes: [], programHash: evidence.programHash,
    stageAuthorizations, objective,
    outcomeEvidenceHash: commitment({
      program, providerArtifacts, simulations: evidence.simulations, stageAuthorizations, objective,
    }) as Hash };
}
