import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  commitment,
  type AssetIdentityEvidenceV1,
  type AssetValuationEvidenceV1,
  type GeneralAssetPolicyV1,
  type GeneralAssetProgramV1,
} from "@cobia/domain";
import { z } from "zod";
import type { Address, Hash } from "viem";

type ChainId = 1 | 196;

export const GeneralAssetEvidenceArtifactV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-asset-evidence"),
  identities: z.array(AssetIdentityEvidenceV1Schema).min(1).max(16),
  valuations: z.array(AssetValuationEvidenceV1Schema).min(1).max(16),
}).strict();

export type GeneralAssetEvidenceArtifactV1 = z.infer<typeof GeneralAssetEvidenceArtifactV1Schema>;

type Eligible = {
  status: "eligible";
  identityHash: Hash;
  valuationHash?: Hash;
  identityEvidence: AssetIdentityEvidenceV1;
  valuationEvidence?: AssetValuationEvidenceV1;
};

interface RevalidationInput {
  nowSec: number;
  policy: {
    maximumInputUsdE8: string;
    inputIdentityHash: Hash;
    inputValuationHash: Hash;
    outputs: readonly { chainId: ChainId; token: Address; identityHash: Hash }[];
  };
  stage: {
    index: number;
    chainId: ChainId;
    target: Address;
    targetRuntimeCodeHash: Hash;
    input: { token: Address; maximumAtomic: string };
    outputs: readonly { token: Address }[];
  };
  evidence: { identities: readonly AssetIdentityEvidenceV1[];
    valuations: readonly AssetValuationEvidenceV1[] };
  programIdentityEvidenceHashes: readonly Hash[];
  programValuationEvidenceHashes: readonly Hash[];
  eligibility: { eligibility(input: { chainId: ChainId; token: Address;
    inputAtomic?: string }): Promise<Eligible | { status: "verification_pending" | "unsupported"; reason: string }> };
  reader: {
    blockHash(chainId: ChainId, blockNumber: bigint): Promise<Hash | null>;
    codeHash(chainId: ChainId, address: Address, blockNumber: bigint): Promise<Hash | null>;
  };
}

function sameIdentity(left: AssetIdentityEvidenceV1, right: AssetIdentityEvidenceV1): boolean {
  return commitment({
    version: left.version, chainId: left.chainId, token: left.token,
    runtimeCodeHash: left.runtimeCodeHash, proxy: left.proxy, decimals: left.decimals,
    behaviorModule: left.behaviorModule,
  }) === commitment({
    version: right.version, chainId: right.chainId, token: right.token,
    runtimeCodeHash: right.runtimeCodeHash, proxy: right.proxy, decimals: right.decimals,
    behaviorModule: right.behaviorModule,
  });
}

function baselineIdentity(input: RevalidationInput, chainId: ChainId, token: Address) {
  const evidence = input.evidence.identities.find((candidate) =>
    candidate.chainId === chainId && candidate.token === token);
  if (!evidence) throw new Error("Committed asset identity evidence is unavailable");
  const hash = commitment(evidence) as Hash;
  if (!input.programIdentityEvidenceHashes.includes(hash)) {
    throw new Error("Asset identity evidence is not committed by the program");
  }
  return { evidence, hash };
}

function baselineValuation(input: RevalidationInput, identityHash: Hash) {
  const evidence = input.evidence.valuations.find((candidate) =>
    candidate.assetIdentityHash === identityHash &&
    BigInt(candidate.inputAtomic) >= BigInt(input.stage.input.maximumAtomic));
  if (!evidence) throw new Error("Committed asset valuation evidence is unavailable");
  const hash = commitment(evidence) as Hash;
  if (!input.programValuationEvidenceHashes.includes(hash)) {
    throw new Error("Asset valuation evidence is not committed by the program");
  }
  return { evidence, hash };
}

async function currentEligibility(
  input: RevalidationInput,
  token: Address,
  inputAtomic?: string,
): Promise<Eligible> {
  const result = await input.eligibility.eligibility({
    chainId: input.stage.chainId, token, ...(inputAtomic ? { inputAtomic } : {}),
  });
  if (result.status !== "eligible") throw new Error(`Fresh asset evidence is unavailable: ${result.reason}`);
  const identity = AssetIdentityEvidenceV1Schema.parse(result.identityEvidence);
  if (identity.expiresAtSec <= input.nowSec || result.identityHash !== commitment(identity)) {
    throw new Error("Fresh asset identity evidence is stale or invalid");
  }
  return { ...result, identityEvidence: identity };
}

async function assertCanonicalIdentity(input: RevalidationInput, evidence: AssetIdentityEvidenceV1) {
  const blockNumber = BigInt(evidence.blockNumber);
  const canonicalHash = await input.reader.blockHash(evidence.chainId, blockNumber);
  if (canonicalHash !== evidence.blockHash) throw new Error("Fresh asset block hash is not canonical");
}

export async function revalidateStageEvidenceV4(input: RevalidationInput): Promise<{
  pinnedBlockNumber: string;
  pinnedBlockHash: Hash;
  identityHash: Hash;
  valuationHash: Hash;
}> {
  const baselineInput = baselineIdentity(input, input.stage.chainId, input.stage.input.token);
  const baselineValue = baselineValuation(input, baselineInput.hash);
  if (input.stage.index === 0 && (baselineInput.hash !== input.policy.inputIdentityHash ||
      baselineValue.hash !== input.policy.inputValuationHash)) {
    throw new Error("First-stage evidence does not match the signed policy");
  }
  const freshInput = await currentEligibility(input, input.stage.input.token,
    input.stage.input.maximumAtomic);
  if (!sameIdentity(baselineInput.evidence, freshInput.identityEvidence)) {
    throw new Error("Input asset identity drifted from the committed evidence");
  }
  await assertCanonicalIdentity(input, freshInput.identityEvidence);

  const valuation = freshInput.valuationEvidence
    ? AssetValuationEvidenceV1Schema.parse(freshInput.valuationEvidence) : undefined;
  if (!valuation || valuation.expiresAtSec <= input.nowSec ||
      freshInput.valuationHash !== commitment(valuation) ||
      valuation.assetIdentityHash !== freshInput.identityHash ||
      valuation.inputAtomic !== input.stage.input.maximumAtomic) {
    throw new Error("Fresh input valuation evidence is stale or invalid");
  }
  if (BigInt(valuation.conservativeValueUsdE8) > BigInt(input.policy.maximumInputUsdE8)) {
    throw new Error("Fresh input valuation exceeds the signed USD cap");
  }

  for (const output of input.stage.outputs) {
    const baseline = baselineIdentity(input, input.stage.chainId, output.token);
    const policyOutput = input.policy.outputs.find((candidate) =>
      candidate.chainId === input.stage.chainId && candidate.token === output.token);
    if (policyOutput && policyOutput.identityHash !== baseline.hash) {
      throw new Error("Output evidence does not match the signed policy");
    }
    const fresh = await currentEligibility(input, output.token);
    if (!sameIdentity(baseline.evidence, fresh.identityEvidence)) {
      throw new Error("Output asset identity drifted from the committed evidence");
    }
    await assertCanonicalIdentity(input, fresh.identityEvidence);
  }

  const pinnedBlockNumber = freshInput.identityEvidence.blockNumber;
  const targetHash = await input.reader.codeHash(input.stage.chainId, input.stage.target,
    BigInt(pinnedBlockNumber));
  if (targetHash !== input.stage.targetRuntimeCodeHash) {
    throw new Error("Execution target runtime code drifted from the committed program");
  }

  return { pinnedBlockNumber, pinnedBlockHash: freshInput.identityEvidence.blockHash,
    identityHash: baselineInput.hash, valuationHash: baselineValue.hash };
}

export async function revalidateStoredStageEvidenceV4(input: {
  nowSec: number;
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  stageId: Hash;
  evidenceArtifact: unknown;
  eligibility: RevalidationInput["eligibility"];
  reader: RevalidationInput["reader"];
}) {
  const stage = input.program.stages.find(({ stageId }) => stageId === input.stageId);
  if (!stage) throw new Error("Committed general asset stage is unavailable");
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.evidenceArtifact);
  return revalidateStageEvidenceV4({
    nowSec: input.nowSec,
    policy: {
      maximumInputUsdE8: input.policy.input.maximumUsdE8,
      inputIdentityHash: input.policy.inputIdentityHash,
      inputValuationHash: input.policy.inputValuationHash,
      outputs: input.policy.outputs,
    },
    stage,
    evidence,
    programIdentityEvidenceHashes: input.program.identityEvidenceHashes,
    programValuationEvidenceHashes: input.program.valuationEvidenceHashes,
    eligibility: input.eligibility,
    reader: input.reader,
  });
}
