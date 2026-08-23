import {
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  AssetValuationEvidenceV1Schema,
  commitment,
  type AssetValuationEvidenceV1,
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

export interface CompiledGeneralAssetStageV1 {
  stageId: Hash;
  chainId: 1 | 196;
  adapterKey: Hash;
  target: Address;
  targetRuntimeCodeHash: Hash;
  data: Hex;
  valueAtomic: string;
  gasLimit: number;
  approvals: GeneralAssetStageV1["approvals"];
  refundTokens: Address[];
  quoteHash: Hash;
  expiresAtSec: number;
}

interface StageAnchorV1 { chainId: 1 | 196; blockNumber: string; blockHash: Hash }

export interface GeneralAssetProgramVerificationInputV1 {
  policy: unknown;
  program: GeneralAssetProgramV1;
  manifest: RegisteredAdapterManifestV1;
  inputValuationEvidence: unknown;
  verifiedIdentityEvidenceHashes: Hash[];
  anchors: StageAnchorV1[];
  nowSec: number;
  getCodeHash(chainId: 1 | 196, address: Address, blockNumber: string): Promise<Hash | undefined>;
  compileStage(
    stage: GeneralAssetStageV1,
    entry: RegisteredAdapterEntryV1,
  ): Promise<CompiledGeneralAssetStageV1>;
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
  inputExposureUsdE8: string;
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
    compiled.target === stage.target && compiled.targetRuntimeCodeHash === stage.targetRuntimeCodeHash &&
    compiled.data === stage.calldata && compiled.valueAtomic === stage.nativeValueAtomic &&
    commitment(compiled.approvals) === commitment(stage.approvals) &&
    commitment(compiled.refundTokens) === commitment(stage.refundTokens);
}

function findEntry(manifest: RegisteredAdapterManifestV1, stage: GeneralAssetStageV1) {
  return manifest.entries.find(({ adapter, chainId, target }) =>
    adapterKey(adapter) === adapterKey(stage.adapter) && chainId === stage.chainId && target === stage.target);
}

function rejection(errors: Set<string>): GeneralAssetProgramVerdictV1 {
  return { accepted: false, errorCodes: [...errors].sort() };
}

function assetKey(chainId: number, token: string): string {
  return `${chainId}:${token}`;
}

function assessPolicyProgram(
  policy: GeneralAssetPolicyV1,
  program: GeneralAssetProgramV1,
  errors: Set<string>,
): void {
  const first = program.stages[0]!;
  const final = program.stages.at(-1)!;
  if (first.chainId !== policy.sourceChainId || first.input.token !== policy.input.token ||
      BigInt(first.input.maximumAtomic) > BigInt(policy.input.maximumAtomic) ||
      final.chainId !== policy.destinationChainId) errors.add("POLICY_ASSET_MISMATCH");
  for (const expected of policy.outputs) {
    const actual = final.outputs.find(({ token }) => token === expected.token);
    if (expected.chainId !== final.chainId || !actual ||
        BigInt(actual.minimumIncreaseAtomic) < BigInt(expected.minimumAtomic)) {
      errors.add("POLICY_ASSET_MISMATCH");
    }
  }
  const forbiddenAssets = new Set(policy.forbiddenAssets.map(({ chainId, token }) => assetKey(chainId, token)));
  const forbiddenTargets = new Set(policy.forbiddenTargets.map(({ chainId, target }) => `${chainId}:${target}`));
  let approvals = 0;
  let calldataBytes = 0;
  for (const stage of program.stages) {
    approvals += stage.approvals.length;
    calldataBytes += (stage.calldata.length - 2) / 2;
    if (forbiddenTargets.has(`${stage.chainId}:${stage.target}`)) errors.add("FORBIDDEN_TARGET");
    if (forbiddenAssets.has(assetKey(stage.chainId, stage.input.token)) ||
        stage.outputs.some(({ token }) => forbiddenAssets.has(assetKey(stage.chainId, token)))) {
      errors.add("FORBIDDEN_ASSET");
    }
  }
  if (approvals > policy.limits.maxApprovals || calldataBytes > policy.limits.maxCalldataBytes) {
    errors.add("LIMIT_EXCEEDED");
  }
}

export async function verifyGeneralAssetProgramV1(
  input: GeneralAssetProgramVerificationInputV1,
): Promise<GeneralAssetProgramVerdictV1> {
  let policy: GeneralAssetPolicyV1;
  let program: GeneralAssetProgramV1;
  let manifest: RegisteredAdapterManifestV1;
  let inputValuationEvidence: AssetValuationEvidenceV1;
  try {
    policy = GeneralAssetPolicyV1Schema.parse(input.policy);
    program = GeneralAssetProgramV1Schema.parse(input.program);
    manifest = RegisteredAdapterManifestV1Schema.parse(input.manifest);
    inputValuationEvidence = AssetValuationEvidenceV1Schema.parse(input.inputValuationEvidence);
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
  if (commitment(inputValuationEvidence) !== policy.inputValuationHash ||
      inputValuationEvidence.assetIdentityHash !== policy.inputIdentityHash ||
      inputValuationEvidence.expiresAtSec <= input.nowSec ||
      BigInt(inputValuationEvidence.inputAtomic) < BigInt(program.stages[0]!.input.maximumAtomic)) {
    errors.add("VALUATION_EVIDENCE_MISMATCH");
  }
  if (program.stages.length > policy.limits.maxStages) errors.add("LIMIT_EXCEEDED");
  assessPolicyProgram(policy, program, errors);

  const allowed = new Set(policy.allowedAdapters.map(adapterKey));
  const anchors = new Map(input.anchors.map((anchor) => [anchor.chainId, anchor]));
  const compiledStages: CompiledGeneralAssetStageV1[] = [];
  const replays: GeneralAssetStageReplayV1[] = [];
  for (const stage of program.stages) {
    if (!allowed.has(adapterKey(stage.adapter))) errors.add("ADAPTER_NOT_ALLOWED");
    const entry = findEntry(manifest, stage);
    if (!entry) {
      errors.add("ADAPTER_UNREGISTERED");
      continue;
    }
    const selector = stage.calldata.slice(0, 10);
    if (!entry.selectors.includes(selector)) errors.add("SELECTOR_UNREGISTERED");
    if (stage.targetRuntimeCodeHash !== entry.runtimeCodeHash) errors.add("TARGET_IDENTITY_MISMATCH");
    if (stage.approvals.some(({ spender }) => !entry.approvalSpenders.includes(spender))) {
      errors.add("APPROVAL_SPENDER_UNREGISTERED");
    }
    const anchor = anchors.get(stage.chainId);
    if (!anchor) {
      errors.add("ANCHOR_MISSING");
      continue;
    }
    if (await input.getCodeHash(stage.chainId, stage.target, anchor.blockNumber) !== entry.runtimeCodeHash) {
      errors.add("TARGET_CODE_DRIFT");
    }
    const compiled = await input.compileStage(stage, entry);
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
  return {
    accepted: true,
    errorCodes: [],
    policy,
    program,
    manifest,
    compiledStages,
    replays,
    replayHash: commitment(replays) as Hash,
    inputExposureUsdE8: inputValuationEvidence.conservativeValueUsdE8,
  };
}
