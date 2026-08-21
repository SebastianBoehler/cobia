import {
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
  StaticReadV1Schema,
  commitment,
} from "@cobia/domain";
import { isAddressEqual, size, type Address, type Hash } from "viem";
import { verifyCapabilityAssetFlowV2 } from "./asset-flow";
import { CapabilityProgramEvidenceV2Schema, type CapabilityProgramEvidenceV2 } from "./evidence-v2";
import type { CapabilityDeploymentV1, CompiledCapabilityActionV1 } from "./module";
import { CapabilityProgramV2Schema, capabilityProgramCommitmentV2 } from "./program-v2";
import type { CapabilityRegistryV1 } from "./registry";
import {
  StaticReadErrorV1,
  decodeStaticReadReturnV1,
  evaluateStaticPredicateV1,
  staticPredicateSatisfiedV1,
  type StaticReadCallerV1,
} from "./static-read";

export type CapabilityProgramV2RejectionCode =
  | "ANCHOR_MISMATCH" | "ASSET_FLOW_INVALID" | "CAPABILITY_EVIDENCE_INVALID"
  | "CAPABILITY_NOT_ALLOWED" | "CAPABILITY_PARAMETERS_INVALID" | "CHAIN_MISMATCH"
  | "FINAL_BALANCE_TOO_LOW" | "FORBIDDEN_ASSET" | "FORBIDDEN_TARGET"
  | "LIMIT_EXCEEDED" | "OBJECTIVE_MISMATCH" | "OBSERVATION_MISSING"
  | "POLICY_MISMATCH" | "PREDICATE_FALSE" | "PROGRAM_SCHEMA_INVALID"
  | "REPLAY_MISMATCH" | "STALE_EVIDENCE" | "STATIC_CALL_CODE_MISMATCH"
  | "STATIC_CALL_FAILED" | "STATIC_RETURN_INVALID" | "TARGET_CODE_MISMATCH"
  | "UNSUPPORTED_CAPABILITY";

export interface CapabilityProgramReplayResultV2 {
  reproduced: boolean;
  traceHash: Hash;
  stateDiffHash: Hash;
  eventsHash: Hash;
  balanceDeltas: CapabilityProgramEvidenceV2["balanceDeltas"];
  deployments: CapabilityProgramEvidenceV2["deployments"];
  observations: CapabilityProgramEvidenceV2["observations"];
  objective?: CapabilityProgramEvidenceV2["objective"];
}

export interface VerifyCapabilityProgramInputV2 {
  policy: unknown;
  wallet: Address;
  executor: Address;
  snapshot: unknown;
  manifest: unknown;
  program: unknown;
  evidence: unknown;
  registry: CapabilityRegistryV1;
  nowSec: number;
  staticCaller: StaticReadCallerV1;
  confirmAnchor(snapshot: ReturnType<typeof GeneralIntentSnapshotV1Schema.parse>): Promise<boolean>;
  replay(input: {
    compiled: readonly CompiledCapabilityActionV1[];
    evidence: CapabilityProgramEvidenceV2;
  }): Promise<CapabilityProgramReplayResultV2>;
}

function rawChainMismatch(value: unknown, field: string): boolean {
  return Boolean(value && typeof value === "object" && field in value &&
    (value as Record<string, unknown>)[field] !== 196);
}

function sameDeployment(left: CapabilityDeploymentV1, right: CapabilityDeploymentV1): boolean {
  return isAddressEqual(left.address, right.address) && left.runtimeCodeHash === right.runtimeCodeHash &&
    (left.implementation === undefined
      ? right.implementation === undefined
      : right.implementation !== undefined &&
        isAddressEqual(left.implementation.address, right.implementation.address) &&
        left.implementation.runtimeCodeHash === right.implementation.runtimeCodeHash);
}

function sameDeployments(
  left: readonly CapabilityDeploymentV1[],
  right: readonly CapabilityDeploymentV1[],
): boolean {
  const leftAddresses = new Set(left.map(({ address }) => address.toLowerCase()));
  const rightAddresses = new Set(right.map(({ address }) => address.toLowerCase()));
  return left.length === right.length && leftAddresses.size === left.length &&
    rightAddresses.size === right.length && left.every((expected) =>
      right.some((observed) => sameDeployment(expected, observed)));
}

function mergeDeployment(
  left: CapabilityDeploymentV1,
  right: CapabilityDeploymentV1,
): CapabilityDeploymentV1 {
  if (!isAddressEqual(left.address, right.address) || left.runtimeCodeHash !== right.runtimeCodeHash ||
    (left.implementation && right.implementation && !sameDeployment(left, right))) {
    throw new Error("deployment identity conflict");
  }
  return left.implementation ? left : right;
}

function requiredDeployments(
  actions: readonly CompiledCapabilityActionV1[],
  program: ReturnType<typeof CapabilityProgramV2Schema.parse>,
): CapabilityDeploymentV1[] {
  const values = [...actions.flatMap(({ deployments }) => deployments)];
  for (const read of [...program.predicates, ...(program.objective.kind === "satisfy" ? [] : [program.objective.read])]) {
    values.push({ address: read.target, runtimeCodeHash: read.runtimeCodeHash });
  }
  const byAddress = new Map<string, CapabilityDeploymentV1>();
  for (const value of values) {
    const key = value.address.toLowerCase();
    const current = byAddress.get(key);
    byAddress.set(key, current ? mergeDeployment(current, value) : value);
  }
  return [...byAddress.values()];
}

function coversBalances(
  program: ReturnType<typeof CapabilityProgramV2Schema.parse>,
  evidence: CapabilityProgramEvidenceV2,
): boolean {
  return program.balanceConstraints.every((constraint) => {
    const delta = evidence.balanceDeltas.find(({ token, account }) =>
      isAddressEqual(token, constraint.token) && isAddressEqual(account, program.owner));
    if (!delta) return false;
    const minimum = constraint.kind === "minimumFinal"
      ? BigInt(constraint.atomic)
      : BigInt(delta.beforeAtomic) + BigInt(constraint.atomic);
    return BigInt(delta.afterAtomic) >= minimum;
  });
}

function sameReplay(evidence: CapabilityProgramEvidenceV2, replay: CapabilityProgramReplayResultV2) {
  return replay.reproduced && replay.traceHash === evidence.traceHash &&
    replay.stateDiffHash === evidence.stateDiffHash && replay.eventsHash === evidence.eventsHash &&
    commitment(replay.balanceDeltas) === commitment(evidence.balanceDeltas) &&
    sameDeployments(replay.deployments, evidence.deployments) &&
    commitment(replay.observations) === commitment(evidence.observations) &&
    commitment(replay.objective ?? null) === commitment(evidence.objective ?? null);
}

function staticErrorCode(error: unknown): CapabilityProgramV2RejectionCode {
  if (!(error instanceof StaticReadErrorV1)) return "STATIC_RETURN_INVALID";
  if (error.code === "CODE_MISMATCH") return "STATIC_CALL_CODE_MISMATCH";
  if (error.code === "CALL_FAILED") return "STATIC_CALL_FAILED";
  return "STATIC_RETURN_INVALID";
}

function evidenceObservation(
  evidence: CapabilityProgramEvidenceV2,
  predicate: ReturnType<typeof CapabilityProgramV2Schema.parse>["predicates"][number],
) {
  const { phase: _phase, comparator: _comparator, bound: _bound, ...readInput } = predicate;
  const readHash = commitment(StaticReadV1Schema.parse(readInput));
  return evidence.observations.find((item) => item.phase === predicate.phase && item.readHash === readHash);
}

async function verifyObservations(
  program: ReturnType<typeof CapabilityProgramV2Schema.parse>,
  evidence: CapabilityProgramEvidenceV2,
  caller: StaticReadCallerV1,
  errors: Set<CapabilityProgramV2RejectionCode>,
) {
  for (const predicate of program.predicates) {
    const observed = evidenceObservation(evidence, predicate);
    if (!observed) { errors.add("OBSERVATION_MISSING"); continue; }
    try {
      const { phase: _phase, comparator: _comparator, bound: _bound, ...readInput } = predicate;
      const decoded = decodeStaticReadReturnV1(readInput, observed.returnData);
      const satisfied = staticPredicateSatisfiedV1(predicate, decoded.decodedValue);
      if (decoded.decodedValue !== observed.decodedValue) errors.add("CAPABILITY_EVIDENCE_INVALID");
      if (!satisfied || !observed.satisfied) errors.add("PREDICATE_FALSE");
      if (predicate.phase === "before") {
        const independent = await evaluateStaticPredicateV1(predicate, caller);
        if (commitment(independent) !== commitment(observed)) errors.add("CAPABILITY_EVIDENCE_INVALID");
      }
    } catch (error) { errors.add(staticErrorCode(error)); }
  }
  if (evidence.observations.length !== program.predicates.length) {
    errors.add("CAPABILITY_EVIDENCE_INVALID");
  }
  if (program.objective.kind === "satisfy") {
    if (evidence.objective) errors.add("OBJECTIVE_MISMATCH");
    return;
  }
  if (!evidence.objective) { errors.add("OBJECTIVE_MISMATCH"); return; }
  try {
    const decoded = decodeStaticReadReturnV1(program.objective.read, evidence.objective.returnData);
    if (decoded.readHash !== evidence.objective.readHash ||
      decoded.decodedValue !== evidence.objective.decodedValue) errors.add("OBJECTIVE_MISMATCH");
  } catch { errors.add("OBJECTIVE_MISMATCH"); }
}

async function verifyDeploymentIdentities(
  deployments: readonly CapabilityDeploymentV1[],
  caller: StaticReadCallerV1,
  errors: Set<CapabilityProgramV2RejectionCode>,
) {
  for (const deployment of deployments) {
    try {
      if (await caller.getCodeHash(deployment.address) !== deployment.runtimeCodeHash) {
        errors.add("TARGET_CODE_MISMATCH");
      }
      if (deployment.implementation &&
        await caller.getCodeHash(deployment.implementation.address) !== deployment.implementation.runtimeCodeHash) {
        errors.add("TARGET_CODE_MISMATCH");
      }
    } catch {
      errors.add("TARGET_CODE_MISMATCH");
    }
  }
}

export async function verifyCapabilityProgramV2(input: VerifyCapabilityProgramInputV2) {
  const chainMismatch = rawChainMismatch(input.program, "chainId") ||
    rawChainMismatch(input.evidence, "chainId") || rawChainMismatch(input.snapshot, "chainId") ||
    rawChainMismatch(input.policy, "executionChainId");
  let program: ReturnType<typeof CapabilityProgramV2Schema.parse>;
  try { program = CapabilityProgramV2Schema.parse(input.program); } catch {
    return { accepted: false, errorCodes: [chainMismatch ? "CHAIN_MISMATCH" : "PROGRAM_SCHEMA_INVALID"] as CapabilityProgramV2RejectionCode[], compiled: [] };
  }
  let evidence: CapabilityProgramEvidenceV2;
  try { evidence = CapabilityProgramEvidenceV2Schema.parse(input.evidence); } catch {
    return { accepted: false, errorCodes: [chainMismatch ? "CHAIN_MISMATCH" : "CAPABILITY_EVIDENCE_INVALID"] as CapabilityProgramV2RejectionCode[], compiled: [] };
  }
  let policy: ReturnType<typeof GeneralIntentPolicyV2Schema.parse>;
  let snapshot: ReturnType<typeof GeneralIntentSnapshotV1Schema.parse>;
  try {
    policy = GeneralIntentPolicyV2Schema.parse(input.policy);
    snapshot = GeneralIntentSnapshotV1Schema.parse(input.snapshot);
  } catch {
    return { accepted: false, errorCodes: [chainMismatch ? "CHAIN_MISMATCH" : "POLICY_MISMATCH"] as CapabilityProgramV2RejectionCode[], compiled: [] };
  }
  const errors = new Set<CapabilityProgramV2RejectionCode>();
  if (chainMismatch) errors.add("CHAIN_MISMATCH");
  if (program.requestId !== policy.requestId || program.policyHash !== commitment(policy) ||
    program.manifestHash !== policy.manifestHash || program.manifestHash !== snapshot.manifestHash ||
    program.nonce !== policy.nonce || !isAddressEqual(program.owner, policy.owner) ||
    !isAddressEqual(program.owner, input.wallet) || !isAddressEqual(program.executor, input.executor) ||
    !isAddressEqual(program.input.token, policy.input.token) || BigInt(program.input.atomic) > BigInt(policy.input.maxAtomic) ||
    program.deadline > policy.deadline || commitment(program.balanceConstraints) !== commitment(policy.balanceConstraints) ||
    commitment(program.predicates) !== commitment(policy.predicates) || commitment(program.objective) !== commitment(policy.objective)) {
    errors.add("POLICY_MISMATCH");
  }
  const capturedAt = Math.floor(Date.parse(snapshot.capturedAt) / 1_000);
  if (program.pinnedBlock.number !== snapshot.blockNumber || program.pinnedBlock.hash !== snapshot.blockHash ||
    evidence.blockNumber !== snapshot.blockNumber || evidence.blockHash !== snapshot.blockHash ||
    evidence.programHash !== capabilityProgramCommitmentV2(program) || input.nowSec > program.deadline ||
    input.nowSec > capturedAt + policy.maxEvidenceAgeSec) errors.add("STALE_EVIDENCE");
  try {
    if (!(await input.confirmAnchor(snapshot))) errors.add("ANCHOR_MISMATCH");
  } catch { errors.add("ANCHOR_MISMATCH"); }

  const compiled: CompiledCapabilityActionV1[] = [];
  for (const [actionIndex, action] of program.actions.entries()) {
    if (!policy.allowedCapabilities.some(({ id, version }) => id === action.capabilityId && version === action.capabilityVersion)) {
      errors.add("CAPABILITY_NOT_ALLOWED");
    }
    let module;
    try { module = input.registry.resolve(action.capabilityId, action.capabilityVersion); }
    catch { errors.add("UNSUPPORTED_CAPABILITY"); continue; }
    try {
      const parameters = module.parseParameters(action.parameters);
      const result = module.compile({ program, actionIndex, parameters, manifest: input.manifest });
      if (result.capabilityId !== action.capabilityId || result.capabilityVersion !== action.capabilityVersion) {
        errors.add("CAPABILITY_PARAMETERS_INVALID");
      }
      if (!Number.isSafeInteger(result.expectedGas) || result.expectedGas < 21_000 ||
        result.data.slice(0, 10).toLowerCase() !== result.selector.toLowerCase()) {
        errors.add("CAPABILITY_PARAMETERS_INVALID");
      }
      compiled.push(result);
      if (module.verifyEvidence({ program, actionIndex, parameters, manifest: input.manifest, compiled: result, evidence }).length) {
        errors.add("CAPABILITY_EVIDENCE_INVALID");
      }
    } catch { errors.add("CAPABILITY_PARAMETERS_INVALID"); }
  }
  if (compiled.length !== program.actions.length) {
    return { accepted: false, errorCodes: [...errors].sort(), compiled };
  }
  if (program.actions.length > policy.limits.maxActions || compiled.some(({ data }) => size(data) > policy.limits.maxActionCalldataBytes) ||
    compiled.reduce((sum, action) => sum + action.spend.length, 0) > policy.limits.maxApprovals ||
    compiled.reduce((sum, action) => sum + action.expectedGas, 0) > policy.limits.maxExpectedGas) errors.add("LIMIT_EXCEEDED");
  for (const action of compiled) {
    if (policy.forbiddenTargets.some((address) => isAddressEqual(address, action.target))) errors.add("FORBIDDEN_TARGET");
    if (action.deployments.some(({ address, implementation }) =>
      policy.forbiddenTargets.some((forbidden) => isAddressEqual(forbidden, address) ||
        Boolean(implementation && isAddressEqual(forbidden, implementation.address))))) errors.add("FORBIDDEN_TARGET");
    if ([...action.spend, ...action.guaranteedOutputs].some(({ token }) =>
      policy.forbiddenAssets.some((address) => isAddressEqual(address, token)))) errors.add("FORBIDDEN_ASSET");
  }
  if (!verifyCapabilityAssetFlowV2(program, compiled).accepted) errors.add("ASSET_FLOW_INVALID");
  if (!coversBalances(program, evidence)) errors.add("FINAL_BALANCE_TOO_LOW");
  let required: CapabilityDeploymentV1[] = [];
  try {
    required = requiredDeployments(compiled, program);
    if (required.length !== evidence.deployments.length || !required.every((expected) =>
      evidence.deployments.some((observed) => sameDeployment(expected, observed)))) errors.add("TARGET_CODE_MISMATCH");
  } catch { errors.add("TARGET_CODE_MISMATCH"); }
  await verifyDeploymentIdentities(required, input.staticCaller, errors);
  await verifyObservations(program, evidence, input.staticCaller, errors);
  let replay: CapabilityProgramReplayResultV2 | undefined;
  if (errors.size === 0) {
    const result = await input.replay({ compiled, evidence });
    if (sameReplay(evidence, result)) replay = result;
    else errors.add("REPLAY_MISMATCH");
  }
  return { accepted: errors.size === 0, errorCodes: [...errors].sort(), compiled, ...(replay ? { replay } : {}) };
}
