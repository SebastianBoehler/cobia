import {
  commitment,
  routeObjectiveV2,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
} from "@cobia/domain";
import { isAddressEqual, type Address, type Hash } from "viem";
import {
  CapabilityProgramEvidenceV1Schema,
  type CapabilityProgramEvidenceV1,
} from "../coding-agent-proposal";
import { verifyCapabilityAssetFlowV1 } from "./asset-flow";
import type { CompiledCapabilityActionV1, CapabilityDeploymentV1 } from "./module";
import { CapabilityProgramV1Schema, capabilityProgramCommitmentV1 } from "./program";
import type { CapabilityRegistryV1 } from "./registry";

export type CapabilityProgramRejectionCode =
  | "ASSET_FLOW_INVALID" | "CAPABILITY_EVIDENCE_INVALID" | "CAPABILITY_NOT_ALLOWED"
  | "CAPABILITY_PARAMETERS_INVALID" | "CHAIN_MISMATCH"
  | "FINAL_BALANCE_TOO_LOW" | "POLICY_MISMATCH"
  | "PROGRAM_SCHEMA_INVALID" | "REPLAY_MISMATCH"
  | "STALE_EVIDENCE" | "TARGET_CODE_MISMATCH"
  | "UNSUPPORTED_CAPABILITY";

export interface CapabilityReplayResultV1 {
  reproduced: boolean;
  traceHash: Hash;
  stateDiffHash: Hash;
  eventsHash: Hash;
  balanceDeltas: CapabilityProgramEvidenceV1["balanceDeltas"];
  deployments: CapabilityProgramEvidenceV1["deployments"];
}

export interface VerifyCapabilityProgramInputV1 {
  policy: unknown;
  wallet: Address;
  snapshot: unknown;
  manifest: unknown;
  program: unknown;
  evidence: unknown;
  registry: CapabilityRegistryV1;
  nowSec: number;
  replay(input: {
    compiled: readonly CompiledCapabilityActionV1[];
    evidence: CapabilityProgramEvidenceV1;
  }): Promise<CapabilityReplayResultV1>;
}

function sameDeployment(
  expected: CapabilityDeploymentV1,
  observed: CapabilityProgramEvidenceV1["deployments"][number],
): boolean {
  return isAddressEqual(expected.address, observed.address) &&
    expected.runtimeCodeHash === observed.runtimeCodeHash &&
    (expected.implementation === undefined
      ? observed.implementation === undefined
      : observed.implementation !== undefined &&
        isAddressEqual(expected.implementation.address, observed.implementation.address) &&
        expected.implementation.runtimeCodeHash === observed.implementation.runtimeCodeHash);
}

function requiredDeployments(actions: readonly CompiledCapabilityActionV1[]) {
  const deployments = new Map<string, CapabilityDeploymentV1>();
  for (const action of actions) for (const deployment of action.deployments) {
    const key = deployment.address.toLowerCase();
    const current = deployments.get(key);
    if (current && !sameDeployment(current, deployment)) {
      throw new Error("Capability modules disagree on deployment identity");
    }
    deployments.set(key, deployment);
  }
  return [...deployments.values()].sort((left, right) =>
    left.address.toLowerCase().localeCompare(right.address.toLowerCase()));
}

function evidenceCoversConstraints(
  evidence: CapabilityProgramEvidenceV1,
  constraints: ReturnType<typeof CapabilityProgramV1Schema.parse>["constraints"],
): boolean {
  return constraints.every((constraint) => {
    const delta = evidence.balanceDeltas.find((candidate) =>
      isAddressEqual(candidate.token, constraint.token) &&
      isAddressEqual(candidate.account, constraint.account));
    return Boolean(delta && BigInt(delta.afterAtomic) >=
      BigInt(delta.beforeAtomic) + BigInt(constraint.minimumIncreaseAtomic));
  });
}

function objectiveSatisfied(
  policy: ReturnType<typeof StablecoinPolicyV2Schema.parse>,
  constraints: ReturnType<typeof CapabilityProgramV1Schema.parse>["constraints"],
): boolean {
  const objective = routeObjectiveV2(policy);
  if (objective.kind === "earn") return constraints.length > 0;
  const required = objective.kind === "swap"
    ? BigInt(objective.minimumOutputAtomic)
    : BigInt(objective.minimumFinalAtomic) - BigInt(policy.principalAtomic);
  const token = objective.kind === "swap" ? objective.outputAsset : policy.asset;
  return constraints.some((constraint) => isAddressEqual(constraint.token, token) &&
    isAddressEqual(constraint.account, policy.owner) &&
    BigInt(constraint.minimumIncreaseAtomic) >= required);
}

function sameReplay(
  evidence: CapabilityProgramEvidenceV1,
  replay: CapabilityReplayResultV1,
): boolean {
  return replay.reproduced && replay.traceHash === evidence.traceHash &&
    replay.stateDiffHash === evidence.stateDiffHash &&
    replay.eventsHash === evidence.eventsHash &&
    commitment(replay.balanceDeltas) === commitment(evidence.balanceDeltas) &&
    commitment(replay.deployments) === commitment(evidence.deployments);
}

export async function verifyCapabilityProgramV1(input: VerifyCapabilityProgramInputV1): Promise<{
  accepted: boolean;
  errorCodes: CapabilityProgramRejectionCode[];
  compiled: CompiledCapabilityActionV1[];
}> {
  let program: ReturnType<typeof CapabilityProgramV1Schema.parse>;
  let evidence: CapabilityProgramEvidenceV1;
  try {
    program = CapabilityProgramV1Schema.parse(input.program);
    evidence = CapabilityProgramEvidenceV1Schema.parse(input.evidence);
  } catch {
    return { accepted: false, errorCodes: ["PROGRAM_SCHEMA_INVALID"], compiled: [] };
  }
  const errors = new Set<CapabilityProgramRejectionCode>();
  let policy: ReturnType<typeof StablecoinPolicyV2Schema.parse>;
  let snapshot: ReturnType<typeof RouteSnapshotV2Schema.parse>;
  try {
    policy = StablecoinPolicyV2Schema.parse(input.policy);
    snapshot = RouteSnapshotV2Schema.parse(input.snapshot);
  } catch {
    return { accepted: false, errorCodes: ["POLICY_MISMATCH"], compiled: [] };
  }
  if (program.chainId !== policy.executionChainId || evidence.chainId !== program.chainId ||
    snapshot.chainId !== program.chainId) errors.add("CHAIN_MISMATCH");
  if (program.requestId !== policy.requestId || program.policyHash !== commitment(policy) ||
    !isAddressEqual(program.owner, policy.owner) || !isAddressEqual(program.owner, input.wallet) ||
    !isAddressEqual(program.input.token, policy.asset) ||
    program.manifestHash !== snapshot.adapterRegistryHash) errors.add("POLICY_MISMATCH");
  const maximumInput = BigInt(policy.principalAtomic) * BigInt(policy.protocolExposureBps) / 10_000n;
  if (BigInt(program.input.atomic) > maximumInput || program.deadline > policy.deadline ||
    !objectiveSatisfied(policy, program.constraints)) errors.add("POLICY_MISMATCH");
  const capturedAt = Math.floor(Date.parse(snapshot.capturedAt) / 1_000);
  if (program.pinnedBlock.number !== snapshot.blockNumber ||
    program.pinnedBlock.hash !== snapshot.blockHash ||
    evidence.blockNumber !== snapshot.blockNumber || evidence.blockHash !== snapshot.blockHash ||
    evidence.programHash !== capabilityProgramCommitmentV1(program) ||
    input.nowSec > program.deadline || input.nowSec > capturedAt + policy.maxSnapshotAgeSec) {
    errors.add("STALE_EVIDENCE");
  }

  const compiled: CompiledCapabilityActionV1[] = [];
  for (const [actionIndex, action] of program.actions.entries()) {
    let module;
    try {
      module = input.registry.resolve(action.capabilityId, action.capabilityVersion);
    } catch {
      errors.add("UNSUPPORTED_CAPABILITY");
      continue;
    }
    if (module.policyAdapterId && !policy.allowedAdapters.some((adapter) =>
      adapter === module.policyAdapterId)) errors.add("CAPABILITY_NOT_ALLOWED");
    try {
      const parameters = module.parseParameters(action.parameters);
      const result = module.compile({ program, actionIndex, parameters, manifest: input.manifest });
      compiled.push(result);
      if (module.verifyEvidence({
        program, actionIndex, parameters, manifest: input.manifest,
        compiled: result, evidence,
      }).length > 0) errors.add("CAPABILITY_EVIDENCE_INVALID");
    } catch {
      errors.add("CAPABILITY_PARAMETERS_INVALID");
    }
  }
  if (compiled.length !== program.actions.length) {
    return { accepted: false, errorCodes: [...errors].sort(), compiled };
  }
  const flow = verifyCapabilityAssetFlowV1(program, compiled);
  if (!flow.accepted) errors.add("ASSET_FLOW_INVALID");
  if (!evidenceCoversConstraints(evidence, program.constraints)) {
    errors.add("FINAL_BALANCE_TOO_LOW");
  }
  try {
    const required = requiredDeployments(compiled);
    if (required.length !== evidence.deployments.length || !required.every((deployment) =>
      evidence.deployments.some((observed) => sameDeployment(deployment, observed)))) {
      errors.add("TARGET_CODE_MISMATCH");
    }
  } catch {
    errors.add("TARGET_CODE_MISMATCH");
  }
  if (errors.size === 0) {
    const replay = await input.replay({ compiled, evidence });
    if (!sameReplay(evidence, replay)) errors.add("REPLAY_MISMATCH");
  }
  return { accepted: errors.size === 0, errorCodes: [...errors].sort(), compiled };
}
