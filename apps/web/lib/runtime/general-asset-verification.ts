import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema, commitment,
  isNativeAssetAddress,
  stableAssetIdentityV1,
  type GeneralAssetCallV1,
  type GeneralAssetPolicyV1,
  type GeneralAssetProgramV1, type GeneralAssetStageV1 } from "@cobia/domain";
import { verifyGeneralAssetProgramV1, type CompiledGeneralAssetCallV1,
  type CompiledGeneralAssetStageV1,
  type GeneralAssetStageReplayV1, type RegisteredAdapterEntryV1,
  type PinnedAssetReaderV1, type RegisteredAdapterManifestV1 } from "@cobia/solvers";
import { isAddressEqual, keccak256, stringToHex, type Address, type Hash, type Hex } from "viem";
import { attestExecutionProgramV4, authorizationTypedDataV4,
  generalAssetStageNonceV4 } from "../execution-v4/attestation";
import type { ExecutionProgramV4 } from "../execution-v4/commitment";
import { buildGeneralAssetExecutionBundleV4 } from "../execution-v4/execution-bundle";
import { GeneralAssetAuthorizationArtifactsV4Schema } from "../execution-v4/authorization-artifact";
import type { GeneralAssetSwapCompileRequestV1,
  createOkxGeneralAssetSwapCompilerV1 } from "../okx/general-asset-swap";

interface Anchor { chainId: 1 | 196; blockNumber: string; blockHash: Hash }
interface Input {
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  manifest: RegisteredAdapterManifestV1;
  identityEvidence: unknown[];
  valuationEvidence: unknown[];
  anchors: Anchor[];
  nowSec: number;
}
interface Dependencies {
  executor: Address;
  executorCodeHash: Hash;
  executionFor?(chainId: 1 | 196): { executor: Address; executorCodeHash: Hash };
  nowSec(): number;
  refreshAsset(input: { chainId: 1 | 196; token: Address; inputAtomic?: string }): Promise<{
    status: "eligible" | "verification_pending" | "unsupported";
    identityHash?: Hash;
    identityEvidence?: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>;
    valuationHash?: Hash;
    valuationEvidence?: unknown;
  }>;
  getCodeHash(chainId: 1 | 196, address: Address, blockNumber: string): Promise<Hash | undefined>;
  compileSwap: ReturnType<typeof createOkxGeneralAssetSwapCompilerV1>["compile"];
  replayStage(stage: GeneralAssetStageV1, compiled: CompiledGeneralAssetStageV1,
    anchor: Anchor): Promise<GeneralAssetStageReplayV1 | undefined>;
  signTypedData(typedData: ReturnType<typeof authorizationTypedDataV4>): Promise<Hex>;
  assertReady?(anchor: Anchor, stage: GeneralAssetStageV1): Promise<void>;
}

const ADAPTER_KEY = keccak256(stringToHex("okx.swap@1"));

export async function verifyRawGeneralAssetIdentityV1(
  evidence: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>,
  reader: PinnedAssetReaderV1,
  nowSec: number,
): Promise<boolean> {
  if (evidence.capturedAtSec > nowSec || evidence.expiresAtSec <= nowSec) return false;
  const blockNumber = BigInt(evidence.blockNumber);
  if (!("runtimeCodeHash" in evidence)) {
    return await reader.blockHash(evidence.chainId, blockNumber) === evidence.blockHash;
  }
  const [blockHash, runtimeCodeHash, proxy, decimals] = await Promise.all([
    reader.blockHash(evidence.chainId, blockNumber),
    reader.runtimeCodeHash(evidence.chainId, evidence.token, blockNumber),
    reader.proxy(evidence.chainId, evidence.token, blockNumber),
    reader.decimals(evidence.chainId, evidence.token, blockNumber),
  ]);
  return blockHash === evidence.blockHash && runtimeCodeHash === evidence.runtimeCodeHash &&
    commitment(proxy) === commitment(evidence.proxy) && decimals === evidence.decimals;
}

function rejected(code: string) {
  return { accepted: false as const, errorCodes: [code] };
}

function stableIdentity(evidence: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>) {
  return commitment(stableAssetIdentityV1(evidence));
}

function verificationValidUntil(input: Input, verdict: Extract<Awaited<ReturnType<
  typeof verifyGeneralAssetProgramV1>>, { accepted: true }>, evidence: {
    identities: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>[];
    valuations: ReturnType<typeof AssetValuationEvidenceV1Schema.parse>[];
  }) {
  return Math.min(input.policy.competition.closesAt, input.program.deadline,
    ...verdict.compiledStages.map(({ expiresAtSec }) => expiresAtSec),
    ...evidence.identities.map(({ expiresAtSec }) => expiresAtSec),
    ...evidence.valuations.flatMap((valuation) => [valuation.expiresAtSec,
      ...valuation.quotes.map(({ expiresAtSec }) => expiresAtSec)]));
}

function compileCall(input: GeneralAssetSwapCompileRequestV1, call: GeneralAssetCallV1,
  stage: GeneralAssetStageV1,
  entry: RegisteredAdapterEntryV1, deps: Dependencies) {
  return deps.compileSwap(input).then((swap): CompiledGeneralAssetCallV1 => {
    const approval = call.approvals[0];
    const nativeInput = isNativeAssetAddress(stage.input.token);
    if (!isAddressEqual(swap.target, entry.target) ||
        !entry.selectors.includes(swap.data.slice(0, 10) as Hex) ||
        (nativeInput ? Boolean(swap.approval || approval) :
          !swap.approval || !approval ||
          !entry.approvalSpenders.some(({ address }) => isAddressEqual(address, swap.approval!.spender)) ||
          !isAddressEqual(approval.token, stage.input.token) ||
          !isAddressEqual(approval.spender, swap.approval.spender) ||
          approval.maximumAtomic !== swap.approval.maximumAtomic)) {
      throw new Error("Authenticated OKX compilation does not match the reviewed manifest and stage");
    }
    return { adapterKey: ADAPTER_KEY,
      target: swap.target, targetRuntimeCodeHash: entry.runtimeCodeHash, data: swap.data,
      valueAtomic: swap.valueAtomic, gasLimit: swap.gasLimit,
      approvals: swap.approval ? [{ token: stage.input.token, spender: swap.approval.spender,
        maximumAtomic: swap.approval.maximumAtomic }] : [],
      quoteHash: swap.quoteHash, expiresAtSec: swap.expiresAtSec };
  });
}

function execution(verdict: Extract<Awaited<ReturnType<typeof verifyGeneralAssetProgramV1>>,
  { accepted: true }>, stageIndex: number, validUntilSec: number): ExecutionProgramV4 {
  const stage = verdict.program.stages[stageIndex]!;
  const compiled = verdict.compiledStages[stageIndex]!;
  const replay = verdict.replays[stageIndex]!;
  return { policyHash: verdict.program.policyHash, manifestHash: verdict.program.manifestHash,
    canonicalProgramHash: verdict.program.canonicalProgramHash,
    inputIdentityEvidenceHash: verdict.stageInputIdentityEvidenceHashes[stageIndex]!,
    outputIdentityEvidenceHash: verdict.stageOutputIdentityEvidenceHashes[stageIndex]!,
    valuationEvidenceHash: verdict.stageValuationEvidenceHashes[stageIndex]!, stageHash: commitment(stage),
    simulationHash: commitment(replay), pinnedBlockNumber: BigInt(replay.blockNumber),
    pinnedBlockHash: replay.blockHash, sourceChainId: BigInt(stage.chainId), owner: verdict.program.owner,
    inputToken: stage.input.token, outputToken: stage.outputs[0]!.token,
    inputAmount: BigInt(stage.input.maximumAtomic),
    inputUsdE8: BigInt(verdict.stageInputExposuresUsdE8[stageIndex]!),
    deadline: BigInt(validUntilSec),
    nonce: generalAssetStageNonceV4(verdict.policy.nonce, stage), refundTokens: compiled.refundTokens,
    calls: compiled.calls.map((call) => ({ adapterKey: call.adapterKey, target: call.target,
      targetRuntimeCodeHash: call.targetRuntimeCodeHash,
      value: BigInt(call.valueAtomic), gasLimit: call.gasLimit,
      approvals: call.approvals.map(({ token, spender, maximumAtomic }) =>
        ({ token, spender, amount: BigInt(maximumAtomic) })), data: call.data })),
    constraints: stage.outputs.map(({ token, minimumIncreaseAtomic }) =>
      ({ token, kind: 1 as const, minimum: BigInt(minimumIncreaseAtomic) })) };
}

export async function verifyRuntimeGeneralAssetProposalV1(input: Input, deps: Dependencies) {
  const identities = input.identityEvidence.map((value) => AssetIdentityEvidenceV1Schema.safeParse(value));
  if (identities.some(({ success }) => !success)) return rejected("ASSET_EVIDENCE_MISMATCH");
  const baselines = identities.flatMap((result) => result.success ? [result.data] : []);
  const freshIdentities: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>[] = [];
  const freshValuations: ReturnType<typeof AssetValuationEvidenceV1Schema.parse>[] = [];
  const identityBindings: Array<{ programHash: Hash; currentHash: Hash }> = [];
  const valuationBindings: Array<{ programHash: Hash; identityProgramHash: Hash;
    evidence: ReturnType<typeof AssetValuationEvidenceV1Schema.parse> }> = [];
  const anchors: Anchor[] = [];
  for (const stage of input.program.stages) {
    const inputBaseline = baselines.find((value) =>
      commitment(value) === stage.input.identityEvidenceHash);
    const outputBaselines = stage.outputs.map((output) => baselines.find((value) =>
      commitment(value) === output.identityEvidenceHash));
    if (!inputBaseline || outputBaselines.some((value) => !value)) {
      return rejected("ASSET_EVIDENCE_MISMATCH");
    }
    const [freshInput, ...freshOutputs] = await Promise.all([
      deps.refreshAsset({ chainId: stage.chainId, token: stage.input.token,
        inputAtomic: stage.input.maximumAtomic }),
      ...stage.outputs.map(({ token }) => deps.refreshAsset({ chainId: stage.chainId, token })),
    ]);
    const valuation = AssetValuationEvidenceV1Schema.safeParse(freshInput.valuationEvidence);
    if (freshInput.status !== "eligible" || !freshInput.identityHash ||
        !freshInput.identityEvidence || !freshInput.valuationHash || !valuation.success ||
        stableIdentity(freshInput.identityEvidence) !== stableIdentity(inputBaseline) ||
        freshOutputs.some((fresh, index) => fresh.status !== "eligible" || !fresh.identityHash ||
          !fresh.identityEvidence || stableIdentity(fresh.identityEvidence) !==
          stableIdentity(outputBaselines[index]!))) {
      return rejected("ASSET_EVIDENCE_MISMATCH");
    }
    freshIdentities.push(freshInput.identityEvidence,
      ...freshOutputs.map((fresh) => fresh.identityEvidence!));
    freshValuations.push(valuation.data);
    identityBindings.push({ programHash: stage.input.identityEvidenceHash,
      currentHash: freshInput.identityHash }, ...stage.outputs.map((output, index) => ({
      programHash: output.identityEvidenceHash, currentHash: freshOutputs[index]!.identityHash!,
    })));
    valuationBindings.push({ programHash: stage.input.valuationEvidenceHash,
      identityProgramHash: stage.input.identityEvidenceHash, evidence: valuation.data });
    const anchor = { chainId: stage.chainId, blockNumber: freshInput.identityEvidence.blockNumber,
      blockHash: freshInput.identityEvidence.blockHash };
    const existing = anchors.find(({ chainId }) => chainId === stage.chainId);
    if (existing && commitment(existing) !== commitment(anchor)) return rejected("ANCHOR_MISMATCH");
    if (!existing) anchors.push(anchor);
  }
  const verificationNowSec = deps.nowSec();
  if (Math.min(input.policy.competition.closesAt, input.program.deadline,
    ...freshIdentities.map(({ expiresAtSec }) => expiresAtSec),
    ...freshValuations.flatMap((valuation) => [valuation.expiresAtSec,
      ...valuation.quotes.map(({ expiresAtSec }) => expiresAtSec)])) <= verificationNowSec) {
    return rejected("VERIFICATION_EXPIRED");
  }
  for (const stage of input.program.stages) {
    const anchor = anchors.find(({ chainId }) => chainId === stage.chainId)!;
    const executionConfig = deps.executionFor?.(stage.chainId) ??
      { executor: deps.executor, executorCodeHash: deps.executorCodeHash };
    await deps.assertReady?.(anchor, stage);
    if (await deps.getCodeHash(stage.chainId, executionConfig.executor, anchor.blockNumber) !==
        executionConfig.executorCodeHash) return rejected("EXECUTOR_CODE_DRIFT");
  }
  const verdict = await verifyGeneralAssetProgramV1({ policy: input.policy, program: input.program,
    manifest: input.manifest, valuationEvidence: input.valuationEvidence,
    verifiedIdentityEvidenceHashes: input.program.identityEvidenceHashes,
    currentEvidence: { identities: identityBindings, valuations: valuationBindings },
    anchors, nowSec: verificationNowSec,
    getCodeHash: deps.getCodeHash,
    compileCall: (exactCall, exactStage, entry) => compileCall({ chainId: exactStage.chainId,
      executor: (deps.executionFor?.(exactStage.chainId) ?? { executor: deps.executor }).executor,
      owner: input.program.owner, inputToken: exactStage.input.token,
      outputToken: exactStage.outputs[0]!.token, inputAtomic: exactStage.input.maximumAtomic,
      minimumOutputAtomic: exactStage.outputs[0]!.minimumIncreaseAtomic,
      maximumSlippageBps: (input.policy as { limits: { maxSlippageBps: number } }).limits.maxSlippageBps,
    }, exactCall, exactStage, entry, deps), replayStage: deps.replayStage });
  if (!verdict.accepted) return verdict;
  const validUntilSec = verificationValidUntil(input, verdict,
    { identities: freshIdentities, valuations: freshValuations });
  if (deps.nowSec() >= validUntilSec) return rejected("VERIFICATION_EXPIRED");
  const attestations = await Promise.all(input.program.stages.map((stage, stageIndex) => {
    const executor = (deps.executionFor?.(stage.chainId) ?? { executor: deps.executor }).executor;
    return attestExecutionProgramV4({ verdict, stageIndex,
      execution: execution(verdict, stageIndex, validUntilSec), executor,
      signTypedData: deps.signTypedData });
  }));
  if (deps.nowSec() >= validUntilSec) return rejected("VERIFICATION_EXPIRED");
  const authorization = GeneralAssetAuthorizationArtifactsV4Schema.parse(attestations.map((attestation) => ({
    version: 4, stageIndex: attestation.stageIndex,
    chainId: Number(attestation.authorization.chainId), executor: attestation.authorization.executor,
    executionCommitment: attestation.authorization.executionCommitment,
    evidenceHash: attestation.evidenceHash, signature: attestation.signature,
  })));
  const freshEvidence = { identities: freshIdentities, valuations: freshValuations, anchors };
  return { accepted: true as const, errorCodes: [] as const, replay: verdict.replays,
    execution: buildGeneralAssetExecutionBundleV4({ verdict, attestations }),
    authorization, verificationValidUntilSec: validUntilSec, verificationAnchor: anchors[0]!,
    verificationAnchors: anchors,
    freshEvidence: { ...freshEvidence, hash: commitment(freshEvidence) as Hash } };
}
