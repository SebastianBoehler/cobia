import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema, commitment,
  isNativeAssetAddress,
  stableAssetIdentityV1,
  type GeneralAssetPolicyV1,
  type GeneralAssetProgramV1, type GeneralAssetStageV1 } from "@cobia/domain";
import { verifyGeneralAssetProgramV1, type CompiledGeneralAssetStageV1,
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

function supportedRoute(input: Input): boolean {
  if (input.program.stages.length !== 1) return false;
  const stage = input.program.stages[0]!;
  const nativeInput = isNativeAssetAddress(stage.input.token);
  return input.policy.sourceChainId === input.policy.destinationChainId &&
    stage.chainId === input.policy.sourceChainId && stage.adapter.id === "okx.swap" &&
    stage.adapter.version === 1 && stage.delivery.kind === "none" &&
    stage.nativeValueAtomic === (nativeInput ? stage.input.maximumAtomic : "0") &&
    stage.outputs.length === 1 && stage.approvals.length === (nativeInput ? 0 : 1);
}

function verificationValidUntil(input: Input, verdict: Extract<Awaited<ReturnType<
  typeof verifyGeneralAssetProgramV1>>, { accepted: true }>, evidence: {
    input: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>;
    output: ReturnType<typeof AssetIdentityEvidenceV1Schema.parse>;
    valuation: ReturnType<typeof AssetValuationEvidenceV1Schema.parse>;
  }) {
  return Math.min(input.policy.competition.closesAt, input.program.deadline,
    ...verdict.compiledStages.map(({ expiresAtSec }) => expiresAtSec),
    evidence.input.expiresAtSec, evidence.output.expiresAtSec, evidence.valuation.expiresAtSec,
    ...evidence.valuation.quotes.map(({ expiresAtSec }) => expiresAtSec));
}

function compileStage(input: GeneralAssetSwapCompileRequestV1, stage: GeneralAssetStageV1,
  entry: RegisteredAdapterEntryV1, deps: Dependencies) {
  return deps.compileSwap(input).then((swap): CompiledGeneralAssetStageV1 => {
    const approval = stage.approvals[0];
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
    return { stageId: stage.stageId, chainId: stage.chainId, adapterKey: ADAPTER_KEY,
      target: swap.target, targetRuntimeCodeHash: entry.runtimeCodeHash, data: swap.data,
      valueAtomic: swap.valueAtomic, gasLimit: swap.gasLimit,
      approvals: swap.approval ? [{ token: stage.input.token, spender: swap.approval.spender,
        maximumAtomic: swap.approval.maximumAtomic }] : [], refundTokens: stage.refundTokens,
      quoteHash: swap.quoteHash, expiresAtSec: swap.expiresAtSec };
  });
}

function execution(verdict: Extract<Awaited<ReturnType<typeof verifyGeneralAssetProgramV1>>,
  { accepted: true }>, validUntilSec: number): ExecutionProgramV4 {
  const stage = verdict.program.stages[0]!;
  const compiled = verdict.compiledStages[0]!;
  const replay = verdict.replays[0]!;
  return { policyHash: verdict.program.policyHash, manifestHash: verdict.program.manifestHash,
    canonicalProgramHash: verdict.program.canonicalProgramHash,
    inputIdentityEvidenceHash: verdict.stageInputIdentityEvidenceHashes[0]!,
    outputIdentityEvidenceHash: verdict.stageOutputIdentityEvidenceHashes[0]!,
    valuationEvidenceHash: verdict.stageValuationEvidenceHashes[0]!, stageHash: commitment(stage),
    simulationHash: commitment(replay), pinnedBlockNumber: BigInt(replay.blockNumber),
    pinnedBlockHash: replay.blockHash, sourceChainId: BigInt(stage.chainId), owner: verdict.program.owner,
    inputToken: stage.input.token, outputToken: stage.outputs[0]!.token,
    inputAmount: BigInt(stage.input.maximumAtomic),
    inputUsdE8: BigInt(verdict.stageInputExposuresUsdE8[0]!),
    deadline: BigInt(validUntilSec),
    nonce: generalAssetStageNonceV4(verdict.policy.nonce, stage), refundTokens: compiled.refundTokens,
    calls: [{ adapterKey: compiled.adapterKey, target: compiled.target,
      targetRuntimeCodeHash: compiled.targetRuntimeCodeHash,
      value: BigInt(compiled.valueAtomic), gasLimit: compiled.gasLimit,
      approvals: compiled.approvals.map(({ token, spender, maximumAtomic }) =>
        ({ token, spender, amount: BigInt(maximumAtomic) })), data: compiled.data }],
    constraints: stage.outputs.map(({ token, minimumIncreaseAtomic }) =>
      ({ token, kind: 1 as const, minimum: BigInt(minimumIncreaseAtomic) })) };
}

export async function verifyRuntimeGeneralAssetProposalV1(input: Input, deps: Dependencies) {
  if (!supportedRoute(input)) return rejected("ROUTE_UNSUPPORTED");
  const identities = input.identityEvidence.map((value) => AssetIdentityEvidenceV1Schema.safeParse(value));
  if (identities.some(({ success }) => !success)) return rejected("ASSET_EVIDENCE_MISMATCH");
  const stage = input.program.stages[0];
  const inputBaseline = identities.find((result) => result.success &&
    commitment(result.data) === stage.input.identityEvidenceHash);
  const outputBaseline = identities.find((result) => result.success &&
    commitment(result.data) === stage.outputs[0]!.identityEvidenceHash);
  if (!inputBaseline?.success || !outputBaseline?.success) return rejected("ASSET_EVIDENCE_MISMATCH");
  const [freshInput, freshOutput] = await Promise.all([
    deps.refreshAsset({ chainId: stage.chainId, token: stage.input.token,
      inputAtomic: stage.input.maximumAtomic }),
    deps.refreshAsset({ chainId: stage.chainId, token: stage.outputs[0]!.token }),
  ]);
  const freshValuation = AssetValuationEvidenceV1Schema.safeParse(freshInput.valuationEvidence);
  if (freshInput.status !== "eligible" || freshOutput.status !== "eligible" ||
      !freshInput.identityHash || !freshOutput.identityHash || !freshInput.identityEvidence ||
      !freshOutput.identityEvidence || !freshInput.valuationHash || !freshValuation.success ||
      stableIdentity(freshInput.identityEvidence) !== stableIdentity(inputBaseline.data) ||
      stableIdentity(freshOutput.identityEvidence) !== stableIdentity(outputBaseline.data)) {
    return rejected("ASSET_EVIDENCE_MISMATCH");
  }
  const verificationNowSec = deps.nowSec();
  if (Math.min(input.policy.competition.closesAt, input.program.deadline,
    freshInput.identityEvidence.expiresAtSec, freshOutput.identityEvidence.expiresAtSec,
    freshValuation.data.expiresAtSec,
    ...freshValuation.data.quotes.map(({ expiresAtSec }) => expiresAtSec)) <= verificationNowSec) {
    return rejected("VERIFICATION_EXPIRED");
  }
  const anchor = { chainId: stage.chainId, blockNumber: freshInput.identityEvidence.blockNumber,
    blockHash: freshInput.identityEvidence.blockHash };
  await deps.assertReady?.(anchor, stage);
  if (await deps.getCodeHash(stage.chainId, deps.executor, anchor.blockNumber) !== deps.executorCodeHash) {
    return rejected("EXECUTOR_CODE_DRIFT");
  }
  const verdict = await verifyGeneralAssetProgramV1({ policy: input.policy, program: input.program,
    manifest: input.manifest, valuationEvidence: input.valuationEvidence,
    verifiedIdentityEvidenceHashes: input.program.identityEvidenceHashes,
    currentEvidence: { identities: [
      { programHash: stage.input.identityEvidenceHash, currentHash: freshInput.identityHash },
      { programHash: stage.outputs[0]!.identityEvidenceHash, currentHash: freshOutput.identityHash },
    ], valuations: [{ programHash: stage.input.valuationEvidenceHash,
      identityProgramHash: stage.input.identityEvidenceHash, evidence: freshValuation.data }] },
    anchors: [anchor], nowSec: verificationNowSec,
    getCodeHash: deps.getCodeHash,
    compileStage: (exactStage, entry) => compileStage({ chainId: exactStage.chainId,
      executor: deps.executor, owner: input.program.owner, inputToken: exactStage.input.token,
      outputToken: exactStage.outputs[0]!.token, inputAtomic: exactStage.input.maximumAtomic,
      minimumOutputAtomic: exactStage.outputs[0]!.minimumIncreaseAtomic,
      maximumSlippageBps: (input.policy as { limits: { maxSlippageBps: number } }).limits.maxSlippageBps,
    }, exactStage, entry, deps), replayStage: deps.replayStage });
  if (!verdict.accepted) return verdict;
  const validUntilSec = verificationValidUntil(input, verdict, { input: freshInput.identityEvidence,
    output: freshOutput.identityEvidence, valuation: freshValuation.data });
  if (deps.nowSec() >= validUntilSec) return rejected("VERIFICATION_EXPIRED");
  const attestation = await attestExecutionProgramV4({ verdict, stageIndex: 0,
    execution: execution(verdict, validUntilSec), executor: deps.executor,
    signTypedData: deps.signTypedData });
  if (deps.nowSec() >= validUntilSec) return rejected("VERIFICATION_EXPIRED");
  const authorization = GeneralAssetAuthorizationArtifactsV4Schema.parse([{
    version: 4, stageIndex: attestation.stageIndex,
    chainId: Number(attestation.authorization.chainId), executor: attestation.authorization.executor,
    executionCommitment: attestation.authorization.executionCommitment,
    evidenceHash: attestation.evidenceHash, signature: attestation.signature,
  }]);
  const freshEvidence = { identities: [freshInput.identityEvidence, freshOutput.identityEvidence],
    valuations: [freshValuation.data], anchors: [anchor] };
  return { accepted: true as const, errorCodes: [] as const, replay: verdict.replays,
    execution: buildGeneralAssetExecutionBundleV4({ verdict, attestations: [attestation] }),
    authorization, verificationValidUntilSec: validUntilSec, verificationAnchor: anchor,
    freshEvidence: { ...freshEvidence, hash: commitment(freshEvidence) as Hash } };
}
