import { commitment, type GeneralAssetPolicyV1, type GeneralAssetStageV1 } from "@cobia/domain";
import type { Hash, Hex } from "viem";
import type { CompiledGeneralAssetStageV1 } from "./program-verifier";

export function isGenericCallV1(stage: GeneralAssetStageV1): boolean {
  return stage.adapter.id === "general.evm-call" && stage.adapter.version === 1;
}

export function compileGenericCallV1(
  stage: GeneralAssetStageV1,
  policy: GeneralAssetPolicyV1,
  deadline: number,
): CompiledGeneralAssetStageV1 {
  return {
    stageId: stage.stageId,
    chainId: stage.chainId,
    adapterKey: commitment({ domain: "cobia.general-evm-call.v1", adapter: stage.adapter }) as Hash,
    target: stage.target,
    targetRuntimeCodeHash: stage.targetRuntimeCodeHash,
    data: stage.calldata as Hex,
    valueAtomic: stage.nativeValueAtomic,
    gasLimit: Math.min(Number(policy.limits.maxGasPerStage), 1_000_000),
    approvals: stage.approvals,
    refundTokens: stage.refundTokens,
    quoteHash: commitment({ domain: "cobia.generic-call-quote.v1", stage }) as Hash,
    expiresAtSec: deadline,
  };
}
