import { commitment, type GeneralAssetPolicyV1, type GeneralAssetProgramV1 } from "@cobia/domain";
import type { Hash } from "viem";
import { createProductionGeneralAssetEligibilityV2 } from "../assets/production-general-asset-eligibility";
import { createGeneralAssetEvidenceChainReaderV4 } from "./evidence-chain-reader";
import { revalidateStoredStageEvidenceV4 } from "./revalidate-stage-evidence";

export async function revalidateProductionStageEvidenceV4(input: {
  nowSec: number;
  stageId: Hash;
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  artifacts: readonly { kind: string; artifactHash: string; payload: unknown }[];
}) {
  const artifact = input.artifacts.find(({ kind }) => kind === "evidence");
  if (!artifact || artifact.artifactHash !== commitment(artifact.payload)) {
    throw new Error("Committed general asset evidence artifact is unavailable");
  }
  return revalidateStoredStageEvidenceV4({
    nowSec: input.nowSec,
    policy: input.policy,
    program: input.program,
    stageId: input.stageId,
    evidenceArtifact: artifact.payload,
    eligibility: createProductionGeneralAssetEligibilityV2(),
    reader: createGeneralAssetEvidenceChainReaderV4(),
  });
}
