import type { GeneralAssetExecutionBundleV4 } from "./stage-artifact";

type Bundle = GeneralAssetExecutionBundleV4;
type Stage = Bundle["stages"][number];

export function generalAssetProgramRecordV4(bundle: Bundle) {
  return {
    programId: bundle.programId,
    canonicalProgramHash: bundle.programId,
    owner: bundle.owner,
    finalOutput: bundle.finalOutput,
  };
}

export function generalAssetStageRecordV4(bundle: Bundle, stage: Stage, expectedNonce: string) {
  return {
    programId: bundle.programId,
    stageId: stage.stageId,
    ordinal: stage.ordinal,
    chainId: stage.chainId,
    predecessorStageId: stage.predecessorStageId,
    sender: stage.transaction.from,
    inputToken: stage.inputToken,
    target: stage.transaction.to,
    valueAtomic: BigInt(stage.transaction.value).toString(),
    calldata: stage.transaction.data,
    expectedNonce,
    requiredConfirmations: stage.requiredConfirmations,
    expectedLogs: stage.expectedLogs,
    delivery: stage.delivery,
  };
}
