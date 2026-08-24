import { commitment, type GeneralAssetCallV1, type GeneralAssetPolicyV1,
  type GeneralAssetStageV1 } from "@cobia/domain";
import { keccak256, stringToHex, type Hash, type Hex } from "viem";
import type { CompiledGeneralAssetCallV1 } from "./program-verifier";

export function isGenericCallV1(call: GeneralAssetCallV1): boolean {
  return call.adapter.id === "general.evm-call" && call.adapter.version === 1;
}

export function compileGenericCallV1(
  call: GeneralAssetCallV1,
  stage: GeneralAssetStageV1,
  _policy: GeneralAssetPolicyV1,
  deadline: number,
): CompiledGeneralAssetCallV1 {
  return {
    adapterKey: keccak256(stringToHex(`${call.adapter.id}@${call.adapter.version}`)),
    target: call.target,
    targetRuntimeCodeHash: call.targetRuntimeCodeHash,
    data: call.calldata as Hex,
    valueAtomic: call.nativeValueAtomic,
    gasLimit: call.gasLimit,
    approvals: call.approvals,
    quoteHash: commitment({ domain: "cobia.generic-call-quote.v1", stageId: stage.stageId,
      call }) as Hash,
    expiresAtSec: deadline,
  };
}
