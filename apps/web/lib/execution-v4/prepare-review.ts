import { isAddressEqual, type Address } from "viem";
import type { createGeneralAssetExecutionRepository } from "../db/general-asset-executions";
import { parseGeneralAssetExecutionBundleV4 } from "./stage-artifact";
import { generalAssetProgramRecordV4, generalAssetStageRecordV4 } from "./stage-record";

type Repository = ReturnType<typeof createGeneralAssetExecutionRepository>;

export async function prepareGeneralAssetExecutionReviewV4(input: {
  artifact: unknown;
  owner: Address;
  submissionState: string;
  repository: Pick<Repository, "prepareStage">;
  revalidate(stageId: `0x${string}`): Promise<unknown>;
}) {
  const bundle = parseGeneralAssetExecutionBundleV4(input.artifact);
  if (input.submissionState !== "attested" || !isAddressEqual(bundle.owner, input.owner)) {
    throw new Error("General asset execution is not attested for this owner");
  }
  const first = bundle.stages[0]!;
  await input.revalidate(first.stageId);
  const prepared = await input.repository.prepareStage({
    program: generalAssetProgramRecordV4(bundle),
    stage: generalAssetStageRecordV4(bundle, first),
  });
  return {
    programVersion: 4 as const,
    programId: bundle.programId,
    owner: bundle.owner,
    deadline: bundle.deadline,
    state: prepared.state,
    finalOutput: bundle.finalOutput,
    stages: bundle.stages.map((stage, index) => ({
      stageId: stage.stageId,
      ordinal: stage.ordinal,
      chainId: stage.chainId,
      predecessorStageId: stage.predecessorStageId,
      state: index === 0 ? prepared.state : "pending",
      inputToken: stage.inputToken,
      transaction: stage.transaction,
      requiredConfirmations: stage.requiredConfirmations,
      delivery: stage.delivery,
      evidenceHash: stage.evidenceHash,
    })),
    guarantee: "Each wallet send is armed durably and must exactly match its independent attestation.",
  };
}
