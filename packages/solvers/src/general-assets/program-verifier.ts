import {
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  AssetValuationEvidenceV1Schema,
  commitment,
  type AssetValuationEvidenceV1,
  type GeneralAssetCallV1,
  type GeneralAssetPolicyV1,
  type GeneralAssetProgramV1,
  type GeneralAssetStageV1,
} from "@cobia/domain";
import type { Address, Hash, Hex } from "viem";
import {
  RegisteredAdapterManifestV1Schema,
  type RegisteredAdapterEntryV1,
  type RegisteredAdapterManifestV1,
} from "./adapter-manifest";
import { assessGeneralAssetStageFlowV1, type GeneralAssetStageReplayV1 } from "./asset-flow";
import { compileGenericCallV1, isGenericCallV1 } from "./generic-call";
import { assessGeneralAssetPolicyProgramV1 } from "./program-policy";

export interface CompiledGeneralAssetCallV1 {
  adapterKey: Hash;
  target: Address;
  targetRuntimeCodeHash: Hash;
  data: Hex;
  valueAtomic: string;
  gasLimit: number;
  approvals: GeneralAssetCallV1["approvals"];
  quoteHash: Hash;
  expiresAtSec: number;
}

export interface CompiledGeneralAssetStageV1 {
  stageId: Hash;
  chainId: 1 | 196;
  calls: CompiledGeneralAssetCallV1[];
  refundTokens: Address[];
  quoteHash: Hash;
  expiresAtSec: number;
}

interface StageAnchorV1 { chainId: 1 | 196; blockNumber: string; blockHash: Hash }

export interface GeneralAssetProgramVerificationInputV1 {
  policy: unknown;
  program: GeneralAssetProgramV1;
  manifest: RegisteredAdapterManifestV1;
  valuationEvidence: unknown[];
  verifiedIdentityEvidenceHashes: Hash[];
  currentEvidence?: {
    identities: Array<{ programHash: Hash; currentHash: Hash }>;
    valuations: Array<{ programHash: Hash; identityProgramHash: Hash; evidence: unknown }>;
  };
  anchors: StageAnchorV1[];
  nowSec: number;
  getCodeHash(chainId: 1 | 196, address: Address, blockNumber: string): Promise<Hash | undefined>;
  compileCall(
    call: GeneralAssetCallV1,
    stage: GeneralAssetStageV1,
    entry: RegisteredAdapterEntryV1,
  ): Promise<CompiledGeneralAssetCallV1>;
  replayStage(
    stage: GeneralAssetStageV1,
    compiled: CompiledGeneralAssetStageV1,
    anchor: StageAnchorV1,
  ): Promise<GeneralAssetStageReplayV1 | undefined>;
}

export type GeneralAssetProgramVerdictV1 = {
  accepted: false;
  errorCodes: string[];
} | {
  accepted: true;
  errorCodes: [];
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  manifest: RegisteredAdapterManifestV1;
  compiledStages: CompiledGeneralAssetStageV1[];
  replays: GeneralAssetStageReplayV1[];
  replayHash: Hash;
  stageInputExposuresUsdE8: string[];
  stageObservedInputExposuresUsdE8: string[];
  stageInputIdentityEvidenceHashes: Hash[];
  stageOutputIdentityEvidenceHashes: Hash[];
  stageValuationEvidenceHashes: Hash[];
};

export function canonicalGeneralAssetProgramHash(input: GeneralAssetProgramV1): Hash {
  const { canonicalProgramHash: _ignored, ...canonical } = input;
  return commitment(canonical) as Hash;
}

function adapterKey(adapter: { id: string; version: number }): string {
  return `${adapter.id}@${adapter.version}`;
}

function sameCompilation(stage: GeneralAssetStageV1, compiled: CompiledGeneralAssetStageV1): boolean {
  return compiled.stageId === stage.stageId && compiled.chainId === stage.chainId &&
    commitment(compiled.refundTokens) === commitment(stage.refundTokens) &&
    compiled.calls.length === stage.calls.length && compiled.calls.every((call, index) => {
      const expected = stage.calls[index]!;
      return call.target === expected.target &&
        call.targetRuntimeCodeHash === expected.targetRuntimeCodeHash &&
        call.data === expected.calldata && call.valueAtomic === expected.nativeValueAtomic &&
        call.gasLimit === expected.gasLimit &&
        commitment(call.approvals) === commitment(expected.approvals);
    });
}

function findEntry(manifest: RegisteredAdapterManifestV1, stage: GeneralAssetStageV1,
  call: GeneralAssetCallV1) {
  return manifest.entries.find(({ adapter, chainId, target }) =>
    adapterKey(adapter) === adapterKey(call.adapter) && chainId === stage.chainId && target === call.target);
}

function rejection(errors: Set<string>): GeneralAssetProgramVerdictV1 {
  return { accepted: false, errorCodes: [...errors].sort() };
}

export async function verifyGeneralAssetProgramV1(
  input: GeneralAssetProgramVerificationInputV1,
): Promise<GeneralAssetProgramVerdictV1> {
  let policy: GeneralAssetPolicyV1;
  let program: GeneralAssetProgramV1;
  let manifest: RegisteredAdapterManifestV1;
  let valuationEvidence: AssetValuationEvidenceV1[];
  try {
    policy = GeneralAssetPolicyV1Schema.parse(input.policy);
    program = GeneralAssetProgramV1Schema.parse(input.program);
    manifest = RegisteredAdapterManifestV1Schema.parse(input.manifest);
    valuationEvidence = input.valuationEvidence.map((value) => AssetValuationEvidenceV1Schema.parse(value));
  } catch {
    return rejection(new Set(["PROGRAM_INVALID"]));
  }

  const errors = new Set<string>();
  if (program.policyHash !== commitment(policy) || program.owner !== policy.owner ||
      program.deadline > policy.deadline || input.nowSec >= program.deadline) errors.add("POLICY_MISMATCH");
  const expectedManifestHash = commitment(manifest);
  if (policy.manifestHash !== expectedManifestHash || program.manifestHash !== expectedManifestHash) {
    errors.add("MANIFEST_MISMATCH");
  }
  if (program.canonicalProgramHash !== canonicalGeneralAssetProgramHash(program)) {
    errors.add("PROGRAM_COMMITMENT_MISMATCH");
  }
  if (!program.identityEvidenceHashes.includes(policy.inputIdentityHash) ||
      policy.outputs.some(({ identityHash }) => !program.identityEvidenceHashes.includes(identityHash)) ||
      !program.valuationEvidenceHashes.includes(policy.inputValuationHash) ||
      program.identityEvidenceHashes.some((hash) => !input.verifiedIdentityEvidenceHashes.includes(hash))) {
    errors.add("ASSET_EVIDENCE_MISMATCH");
  }
  const identityBindings = new Map(input.currentEvidence?.identities.map((binding) =>
    [binding.programHash, binding.currentHash]) ?? input.verifiedIdentityEvidenceHashes.map((hash) => [hash, hash]));
  const currentValuations = input.currentEvidence?.valuations.map((binding) => ({ ...binding,
    evidence: AssetValuationEvidenceV1Schema.parse(binding.evidence) })) ?? valuationEvidence.map((evidence) => ({
    programHash: commitment(evidence) as Hash, identityProgramHash: evidence.assetIdentityHash, evidence }));
  const valuations = new Map(currentValuations.map((binding) => [binding.programHash, binding]));
  const stageInputIdentityEvidenceHashes: Hash[] = [];
  const stageOutputIdentityEvidenceHashes: Hash[] = [];
  const stageValuationEvidenceHashes: Hash[] = [];
  const stageObservedInputExposuresUsdE8 = program.stages.map((stage) => {
    const binding = valuations.get(stage.input.valuationEvidenceHash);
    const evidence = binding?.evidence;
    const currentInputHash = identityBindings.get(stage.input.identityEvidenceHash);
    const currentOutputHashes = stage.outputs.map(({ identityEvidenceHash }) =>
      identityBindings.get(identityEvidenceHash));
    if (!binding || !evidence || !currentInputHash || currentOutputHashes.some((hash) => !hash) ||
        binding.identityProgramHash !== stage.input.identityEvidenceHash ||
        evidence.assetIdentityHash !== currentInputHash ||
        evidence.expiresAtSec <= input.nowSec ||
        BigInt(evidence.inputAtomic) < BigInt(stage.input.maximumAtomic) ||
        BigInt(evidence.conservativeValueUsdE8) > BigInt(stage.input.maximumUsdE8) ||
        BigInt(stage.input.maximumUsdE8) > BigInt(policy.input.maximumUsdE8)) {
      errors.add("VALUATION_EVIDENCE_MISMATCH");
      return "0";
    }
    stageInputIdentityEvidenceHashes.push(currentInputHash);
    const exactOutputHashes = currentOutputHashes as Hash[];
    stageOutputIdentityEvidenceHashes.push(exactOutputHashes.length === 1
      ? exactOutputHashes[0]! : commitment(exactOutputHashes) as Hash);
    stageValuationEvidenceHashes.push(commitment(evidence) as Hash);
    return evidence.conservativeValueUsdE8;
  });
  const first = program.stages[0]!;
  if (first.input.identityEvidenceHash !== policy.inputIdentityHash ||
      first.input.valuationEvidenceHash !== policy.inputValuationHash ||
      first.input.maximumUsdE8 !== policy.input.maximumUsdE8) {
    errors.add("VALUATION_EVIDENCE_MISMATCH");
  }
  if (program.stages.length > policy.limits.maxStages) errors.add("LIMIT_EXCEEDED");
  assessGeneralAssetPolicyProgramV1(policy, program, errors);

  const allowed = new Set(policy.allowedAdapters.map(adapterKey));
  const anchors = new Map(input.anchors.map((anchor) => [anchor.chainId, anchor]));
  const compiledStages: CompiledGeneralAssetStageV1[] = [];
  const replays: GeneralAssetStageReplayV1[] = [];
  for (const stage of program.stages) {
    const anchor = anchors.get(stage.chainId);
    if (!anchor) {
      errors.add("ANCHOR_MISSING");
      continue;
    }
    const compiledCalls: CompiledGeneralAssetCallV1[] = [];
    for (const call of stage.calls) {
      if (!allowed.has(adapterKey(call.adapter))) errors.add("ADAPTER_NOT_ALLOWED");
      const generic = isGenericCallV1(call);
      const entry = findEntry(manifest, stage, call);
      if (!entry && !generic) {
        errors.add("ADAPTER_UNREGISTERED");
        continue;
      }
      const selector = call.calldata.slice(0, 10);
      if (entry && !entry.selectors.includes(selector)) errors.add("SELECTOR_UNREGISTERED");
      if (entry && call.targetRuntimeCodeHash !== entry.runtimeCodeHash) {
        errors.add("TARGET_IDENTITY_MISMATCH");
      }
      if (entry && call.approvals.some(({ spender }) =>
        !entry.approvalSpenders.some(({ address }) => address === spender))) {
        errors.add("APPROVAL_SPENDER_UNREGISTERED");
      }
      if (await input.getCodeHash(stage.chainId, call.target, anchor.blockNumber) !==
          call.targetRuntimeCodeHash) errors.add("TARGET_CODE_DRIFT");
      for (const approval of call.approvals) {
        const registered = entry?.approvalSpenders.find(({ address }) => address === approval.spender);
        if (registered && await input.getCodeHash(stage.chainId, approval.spender, anchor.blockNumber) !==
            registered.runtimeCodeHash) {
          errors.add("APPROVAL_SPENDER_CODE_DRIFT");
        } else if (!registered && generic &&
            await input.getCodeHash(stage.chainId, approval.spender, anchor.blockNumber) === undefined) {
          errors.add("APPROVAL_SPENDER_CODE_DRIFT");
        }
      }
      compiledCalls.push(generic
        ? compileGenericCallV1(call, stage, policy, program.deadline)
        : await input.compileCall(call, stage, entry!));
    }
    const destinationChainId = stage.delivery.kind === "bridge"
      ? stage.delivery.destinationChainId : undefined;
    if (destinationChainId !== undefined && !stage.calls.some((call) => {
      const entry = findEntry(manifest, stage, call);
      return entry?.bridgeDelivery?.destinationChainId === destinationChainId;
    })) errors.add("BRIDGE_DELIVERY_UNREGISTERED");
    if (compiledCalls.length !== stage.calls.length) continue;
    const compiled: CompiledGeneralAssetStageV1 = {
      stageId: stage.stageId,
      chainId: stage.chainId,
      calls: compiledCalls,
      refundTokens: stage.refundTokens,
      quoteHash: commitment(compiledCalls.map(({ quoteHash }) => quoteHash)) as Hash,
      expiresAtSec: Math.min(...compiledCalls.map(({ expiresAtSec }) => expiresAtSec)),
    };
    compiledStages.push(compiled);
    if (!sameCompilation(stage, compiled)) errors.add("ADAPTER_COMPILE_MISMATCH");
    if (compiled.expiresAtSec <= input.nowSec) errors.add("QUOTE_EXPIRED");
    const replay = await input.replayStage(stage, compiled, anchor);
    if (!replay) {
      errors.add("STAGE_REPLAY_MISSING");
      continue;
    }
    replays.push(replay);
    if (replay.stageId !== stage.stageId || replay.chainId !== stage.chainId ||
        replay.blockNumber !== anchor.blockNumber || replay.blockHash !== anchor.blockHash ||
        replay.compiledCallHash !== commitment(compiled) || !replay.matchesCompiledCalls || !replay.success) {
      errors.add("REPLAY_DIVERGED");
    }
    if (BigInt(replay.gasUsed) > BigInt(policy.limits.maxGasPerStage)) errors.add("GAS_LIMIT_EXCEEDED");
    assessGeneralAssetStageFlowV1(stage, replay).forEach((error) => errors.add(error));
  }
  if (compiledStages.length !== program.stages.length || replays.length !== program.stages.length) {
    errors.add("STAGE_REPLAY_MISSING");
  }
  if (errors.size > 0) return rejection(errors);
  const stageInputExposuresUsdE8 = program.stages.map((stage) => stage.input.maximumUsdE8);
  return {
    accepted: true,
    errorCodes: [],
    policy,
    program,
    manifest,
    compiledStages,
    replays,
    replayHash: commitment(replays) as Hash,
    stageInputExposuresUsdE8,
    stageObservedInputExposuresUsdE8,
    stageInputIdentityEvidenceHashes,
    stageOutputIdentityEvidenceHashes,
    stageValuationEvidenceHashes,
  };
}
