import { decodeFunctionData, isAddressEqual, type Address } from "viem";
import { COBIA_EXECUTOR_V4_ABI } from "./abi";
import type { z } from "zod";
import { GeneralAssetAuthorizationArtifactsV4Schema } from "./authorization-artifact";
import { executionProgramHashV4, type ExecutionProgramV4 } from "./commitment";
import type { GeneralAssetExecutionBundleV4 } from "./stage-artifact";

type Authorizations = z.infer<typeof GeneralAssetAuthorizationArtifactsV4Schema>;

export function assertGeneralAssetArtifactIntegrityV4(
  execution: GeneralAssetExecutionBundleV4,
  authorizations: Authorizations,
): void {
  execution.stages.forEach((stage, index) => {
    const artifact = authorizations[index];
    if (!artifact || !isAddressEqual(artifact.executor as Address, stage.transaction.to) ||
        artifact.chainId !== stage.chainId || artifact.evidenceHash !== stage.evidenceHash) {
      throw new Error("Authorization does not match the exact execution stage");
    }
    const decoded = decodeFunctionData({ abi: COBIA_EXECUTOR_V4_ABI, data: stage.transaction.data });
    if (decoded.functionName !== "execute") throw new Error("Execution call is not Executor V4");
    const [program, embedded, signature] = decoded.args;
    if (executionProgramHashV4(program as unknown as ExecutionProgramV4) !==
          artifact.executionCommitment ||
        embedded.executionCommitment !== artifact.executionCommitment ||
        !isAddressEqual(embedded.executor, artifact.executor as Address) ||
        embedded.chainId !== BigInt(artifact.chainId) || signature !== artifact.signature) {
      throw new Error("Authorization commitment does not match encoded execution");
    }
  });
}
