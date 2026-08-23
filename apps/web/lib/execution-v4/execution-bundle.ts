import type { GeneralAssetProgramVerdictV1 } from "@cobia/solvers";
import { isAddressEqual, toHex, type Address, type Hash, type Hex } from "viem";
import { parseGeneralAssetExecutionBundleV4 } from "./stage-artifact";

export interface AttestedGeneralAssetStageV4 {
  stageIndex: number;
  authorization: { chainId: bigint; owner: Address; canonicalProgramHash: Hash; deadline: bigint };
  call: { to: Address; data: Hex; value: bigint };
  evidenceHash: Hash;
}

export function buildGeneralAssetExecutionBundleV4(input: {
  verdict: GeneralAssetProgramVerdictV1;
  attestations: readonly AttestedGeneralAssetStageV4[];
}) {
  if (!input.verdict.accepted) throw new Error("Execution bundle requires an accepted verdict");
  const { program } = input.verdict;
  if (input.attestations.length !== program.stages.length) {
    throw new Error("Execution bundle requires one attestation per stage");
  }
  const stages = program.stages.map((stage, index) => {
    const attestation = input.attestations[index];
    if (!attestation || attestation.stageIndex !== index ||
        attestation.authorization.chainId !== BigInt(stage.chainId) ||
        attestation.authorization.canonicalProgramHash !== program.canonicalProgramHash ||
        !isAddressEqual(attestation.authorization.owner, program.owner)) {
      throw new Error("Execution bundle attestation does not match the exact stage");
    }
    const next = program.stages[index + 1];
    const delivery = stage.delivery.kind === "bridge"
      ? (() => {
        if (!next || next.chainId !== stage.delivery.destinationChainId ||
            !isAddressEqual(stage.delivery.recipient, program.owner)) {
          throw new Error("Bridge stage does not bind its destination successor");
        }
        return { kind: "bridge" as const, destinationChainId: stage.delivery.destinationChainId,
          recipient: stage.delivery.recipient, token: next.input.token,
          minimumAtomic: stage.delivery.minimumDeliveredAtomic };
      })()
      : { kind: "none" as const };
    return {
      stageId: stage.stageId, ordinal: stage.index, chainId: stage.chainId,
      predecessorStageId: stage.predecessorStageId, inputToken: stage.input.token,
      requiredConfirmations: stage.finality.confirmations,
      transaction: { chainId: stage.chainId, from: program.owner, to: attestation.call.to,
        value: toHex(attestation.call.value), data: attestation.call.data },
      expectedLogs: [], delivery, evidenceHash: attestation.evidenceHash,
    };
  });
  return parseGeneralAssetExecutionBundleV4({
    version: 4, kind: "general-asset-execution", programId: program.canonicalProgramHash,
    owner: program.owner,
    deadline: Math.min(program.deadline,
      ...input.attestations.map(({ authorization }) => Number(authorization.deadline))),
    finalOutput: program.finalOutput, stages,
  });
}
