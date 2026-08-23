import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema, commitment,
  type GeneralAssetPolicyV1, type GeneralAssetProgramV1 } from "@cobia/domain";
import { assessGeneralAssetStageFlowV1, type GeneralAssetEvidenceArtifactV1 } from "@cobia/solvers";
import { decodeFunctionData, isAddressEqual, keccak256, recoverTypedDataAddress, stringToHex,
  type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { COBIA_EXECUTOR_V4_ABI } from "../execution-v4/abi";
import { authorizationTypedDataV4, generalAssetStageNonceV4 } from
  "../execution-v4/attestation";
import { GeneralAssetAuthorizationArtifactsV4Schema } from "../execution-v4/authorization-artifact";
import { assertGeneralAssetArtifactIntegrityV4 } from "../execution-v4/artifact-integrity";
import { authorizationPayloadHashV4, buildAuthorizationV4,
  type ExecutionProgramV4 } from "../execution-v4/commitment";
import { parseGeneralAssetExecutionBundleV4 } from "../execution-v4/stage-artifact";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/)
  .transform((value) => value as Hash);
const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/)
  .transform((value) => value as Address);
const AnchorSchema = z.object({ chainId: z.union([z.literal(1), z.literal(196)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/), blockHash: HashSchema }).strict();
const ReplaySchema = z.object({ stageId: HashSchema,
  chainId: z.union([z.literal(1), z.literal(196)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/), blockHash: HashSchema,
  compiledCallHash: HashSchema, matchesCompiledCalls: z.literal(true), success: z.literal(true),
  gasUsed: z.string().regex(/^(0|[1-9][0-9]*)$/),
  ownerAssetDeltas: z.array(z.object({ token: AddressSchema,
    deltaAtomic: z.string().regex(/^-?(0|[1-9][0-9]*)$/) }).strict()),
  endingAllowances: z.array(z.object({ token: AddressSchema, spender: AddressSchema,
    atomic: z.string().regex(/^(0|[1-9][0-9]*)$/) }).strict()),
  traceHash: HashSchema, stateDiffHash: HashSchema,
}).strict();
const FreshEvidenceSchema = z.object({
  identities: z.array(AssetIdentityEvidenceV1Schema).min(2),
  valuations: z.array(AssetValuationEvidenceV1Schema).min(1),
  anchors: z.array(AnchorSchema).min(1), hash: HashSchema,
}).strict();

export interface GeneralAssetSolutionVerdictV1 {
  accepted: boolean;
  errorCodes: readonly string[];
  replay?: unknown;
  execution?: unknown;
  authorization?: unknown;
  verificationValidUntilSec?: number;
  verificationAnchor?: unknown;
  freshEvidence?: unknown;
}

function sameAddresses(left: readonly Address[], right: readonly Address[]): boolean {
  return left.length === right.length && left.every((value, index) =>
    isAddressEqual(value, right[index]!));
}

function assertExecutionProgram(input: {
  execution: ExecutionProgramV4;
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  replay: z.infer<typeof ReplaySchema>;
  evidenceHashes: { input: Hash; output: Hash; valuation: Hash };
  validUntilSec: number;
}): void {
  const { execution, policy, program, replay, evidenceHashes, validUntilSec } = input;
  const stage = program.stages[0]!;
  const output = stage.outputs[0]!;
  const call = execution.calls[0];
  const expectedAdapterKey = keccak256(stringToHex(`${stage.adapter.id}@${stage.adapter.version}`));
  const fixed = execution.policyHash === program.policyHash &&
    execution.policyHash === commitment(policy) && execution.manifestHash === program.manifestHash &&
    execution.canonicalProgramHash === program.canonicalProgramHash &&
    execution.inputIdentityEvidenceHash === evidenceHashes.input &&
    execution.outputIdentityEvidenceHash === evidenceHashes.output &&
    execution.valuationEvidenceHash === evidenceHashes.valuation &&
    execution.stageHash === commitment(stage) && execution.simulationHash === commitment(replay) &&
    execution.pinnedBlockNumber === BigInt(replay.blockNumber) &&
    execution.pinnedBlockHash === replay.blockHash && execution.sourceChainId === BigInt(stage.chainId) &&
    isAddressEqual(execution.owner, program.owner) && isAddressEqual(execution.inputToken, stage.input.token) &&
    isAddressEqual(execution.outputToken, output.token) &&
    execution.inputAmount === BigInt(stage.input.maximumAtomic) &&
    execution.inputUsdE8 === BigInt(stage.input.maximumUsdE8) &&
    execution.deadline === BigInt(validUntilSec) &&
    execution.nonce === generalAssetStageNonceV4(policy.nonce, stage);
  const callMatches = execution.calls.length === 1 && call?.adapterKey === expectedAdapterKey &&
    isAddressEqual(call.target, stage.target) && call.value === BigInt(stage.nativeValueAtomic) &&
    call.data === stage.calldata && call.gasLimit <= Number(policy.limits.maxGasPerStage) &&
    call.approvals.length === stage.approvals.length && call.approvals.every((approval, index) => {
      const expected = stage.approvals[index]!;
      return isAddressEqual(approval.token, expected.token) &&
        isAddressEqual(approval.spender, expected.spender) &&
        approval.amount === BigInt(expected.maximumAtomic);
    });
  const constraintsMatch = execution.constraints.length === stage.outputs.length &&
    execution.constraints.every((constraint, index) => {
      const expected = stage.outputs[index]!;
      return constraint.kind === 1 && isAddressEqual(constraint.token, expected.token) &&
        constraint.minimum === BigInt(expected.minimumIncreaseAtomic);
    });
  if (!fixed || !callMatches || !constraintsMatch ||
      !sameAddresses(execution.refundTokens, stage.refundTokens)) {
    throw new Error("Execution V4 does not match the signed general asset program");
  }
}

function stableIdentity(value: z.infer<typeof AssetIdentityEvidenceV1Schema>) {
  return commitment({ chainId: value.chainId, token: value.token,
    runtimeCodeHash: value.runtimeCodeHash, proxy: value.proxy, decimals: value.decimals,
    behaviorModule: value.behaviorModule });
}

function validateFreshEvidence(input: { verdict: GeneralAssetSolutionVerdictV1;
  baseline: GeneralAssetEvidenceArtifactV1; program: GeneralAssetProgramV1;
  anchor: z.infer<typeof AnchorSchema>; validUntilSec: number; nowSec: number }) {
  const fresh = FreshEvidenceSchema.parse(input.verdict.freshEvidence);
  const { program, baseline, anchor, validUntilSec } = input;
  const stage = program.stages[0]!;
  const baselineInput = baseline.identities.find((value) =>
    commitment(value) === stage.input.identityEvidenceHash);
  const baselineOutput = baseline.identities.find((value) =>
    commitment(value) === stage.outputs[0]!.identityEvidenceHash);
  const freshInput = fresh.identities.find((value) => value.chainId === stage.chainId &&
    isAddressEqual(value.token, stage.input.token));
  const freshOutput = fresh.identities.find((value) => value.chainId === stage.chainId &&
    isAddressEqual(value.token, stage.outputs[0]!.token));
  const freshValuation = fresh.valuations.find((value) => freshInput &&
    value.assetIdentityHash === commitment(freshInput) && value.inputAtomic === stage.input.maximumAtomic);
  const evidenceBody = { identities: fresh.identities, valuations: fresh.valuations,
    anchors: fresh.anchors };
  if (!baselineInput || !baselineOutput || !freshInput || !freshOutput || !freshValuation ||
      fresh.hash !== commitment(evidenceBody) || stableIdentity(freshInput) !== stableIdentity(baselineInput) ||
      stableIdentity(freshOutput) !== stableIdentity(baselineOutput) ||
      !fresh.anchors.some((value) => commitment(value) === commitment(anchor)) ||
      anchor.chainId !== freshInput.chainId || anchor.blockNumber !== freshInput.blockNumber ||
      anchor.blockHash !== freshInput.blockHash || validUntilSec > program.deadline ||
      validUntilSec > input.verdict.verificationValidUntilSec! ||
      freshInput.capturedAtSec > input.nowSec || freshOutput.capturedAtSec > input.nowSec ||
      freshValuation.capturedAtSec > input.nowSec ||
      validUntilSec > freshInput.expiresAtSec || validUntilSec > freshOutput.expiresAtSec ||
      validUntilSec > freshValuation.expiresAtSec ||
      BigInt(freshValuation.conservativeValueUsdE8) > BigInt(stage.input.maximumUsdE8) ||
      freshValuation.quotes.some(({ fetchedAtSec, expiresAtSec }) =>
        fetchedAtSec > input.nowSec || validUntilSec > expiresAtSec)) {
    throw new Error("Fresh evidence does not authorize the exact execution window");
  }
  return { input: commitment(freshInput) as Hash, output: commitment(freshOutput) as Hash,
    valuation: commitment(freshValuation) as Hash };
}

export async function validateGeneralAssetSolutionV1(input: {
  verdict: GeneralAssetSolutionVerdictV1;
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  baselineEvidence: GeneralAssetEvidenceArtifactV1;
  executor: Address;
  verifierSigner: Address;
  nowSec: number;
}) {
  const { verdict, policy, program, baselineEvidence, executor, verifierSigner, nowSec } = input;
  if (!verdict.accepted || verdict.errorCodes.length > 0) {
    throw new Error(`General asset solution preflight failed: ${verdict.errorCodes.join(",") || "REJECTED"}`);
  }
  const replay = z.array(ReplaySchema).length(program.stages.length).parse(verdict.replay);
  const execution = parseGeneralAssetExecutionBundleV4(verdict.execution);
  const authorization = GeneralAssetAuthorizationArtifactsV4Schema.parse(verdict.authorization);
  const anchor = AnchorSchema.parse(verdict.verificationAnchor);
  const validUntilSec = z.number().int().positive().safe().parse(verdict.verificationValidUntilSec);
  assertGeneralAssetArtifactIntegrityV4(execution, authorization, anchor);
  if (validUntilSec <= nowSec || validUntilSec > policy.deadline ||
      validUntilSec > policy.competition.closesAt) {
    throw new Error("General asset solution verification expired or exceeded signed authority");
  }
  const evidenceHashes = validateFreshEvidence({ verdict, baseline: baselineEvidence,
    program, anchor, validUntilSec, nowSec });
  if (execution.programId !== program.canonicalProgramHash ||
      !isAddressEqual(execution.owner, program.owner) || execution.deadline !== validUntilSec ||
      commitment(execution.finalOutput) !== commitment(program.finalOutput) ||
      execution.stages.length !== program.stages.length || authorization.length !== program.stages.length) {
    throw new Error("General asset execution artifact does not match the proposal");
  }
  for (const [index, stageArtifact] of execution.stages.entries()) {
    const stage = program.stages[index]!;
    const stageReplay = replay[index]!;
    const artifact = authorization[index]!;
    if (stageArtifact.stageId !== stage.stageId || stageArtifact.chainId !== stage.chainId ||
        stageArtifact.inputToken !== stage.input.token ||
        stageArtifact.requiredConfirmations !== stage.finality.confirmations ||
        commitment(stageArtifact.delivery) !== commitment(stage.delivery) ||
        stageReplay.stageId !== stage.stageId || stageReplay.chainId !== stage.chainId ||
        stageReplay.blockNumber !== anchor.blockNumber || stageReplay.blockHash !== anchor.blockHash ||
        artifact.chainId !== stage.chainId || !isAddressEqual(artifact.executor as Address, executor) ||
        !isAddressEqual(stageArtifact.transaction.to, executor)) {
      throw new Error("General asset authorization, replay, and stage artifact do not match");
    }
    const flowErrors = assessGeneralAssetStageFlowV1(stage, stageReplay);
    if (flowErrors.length > 0) {
      throw new Error(`General asset replay violates signed flow: ${flowErrors.join(",")}`);
    }
    const decoded = decodeFunctionData({ abi: COBIA_EXECUTOR_V4_ABI,
      data: stageArtifact.transaction.data });
    if (decoded.functionName !== "execute") throw new Error("Execution call is not Executor V4");
    const [encodedProgram, embeddedAuthorization] = decoded.args;
    const exactProgram = encodedProgram as unknown as ExecutionProgramV4;
    assertExecutionProgram({ execution: exactProgram, policy, program, replay: stageReplay,
      evidenceHashes, validUntilSec });
    const expectedAuthorization = buildAuthorizationV4(exactProgram, executor);
    if (authorizationPayloadHashV4(embeddedAuthorization) !==
        authorizationPayloadHashV4(expectedAuthorization)) {
      throw new Error("Encoded authorization does not bind the exact execution program");
    }
    let recovered: Address;
    try {
      recovered = await recoverTypedDataAddress({ ...authorizationTypedDataV4(expectedAuthorization),
        signature: artifact.signature as Hex });
    } catch {
      throw new Error("Verifier authorization signature is invalid");
    }
    if (!isAddressEqual(recovered, verifierSigner)) {
      throw new Error("Verifier authorization signature has an unexpected signer");
    }
  }
  return { replay, execution, authorization, anchor, validUntilSec };
}
