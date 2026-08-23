import { commitment, type GeneralAssetPolicyV1 } from "@cobia/domain";
import {
  buildGeneralAssetDecisionV1,
  type GeneralAssetEvidenceArtifactV1,
} from "@cobia/solvers";
import type { createSolverProfileRepository } from "../db/solver-profiles";
import type { createSolverRunRepository } from "../db/solver-runs";
import type { createSolverSubmissionRepository } from "../db/solver-submissions";
import { readCodingAgentV3ExecutionConfig, readGeneralAssetV4Config, readOkxCredentials } from
  "../env";
import { createOkxGeneralAssetSwapCompilerV1 } from "../okx/general-asset-swap";
import { privateKeyToAccount } from "viem/accounts";
import { publishAndRunGeneralAssetSolverV1 } from "../orchestrator/run-general-asset-solver";
import {
  assertProductionGeneralAssetPublicReadyV1,
  verifyProductionGeneralAssetDecisionV1,
} from "./production-general-asset-verifier";

export class GeneralAssetPublicUnavailableError extends Error {}

export async function runProductionGeneralAssetSolverV1(input: {
  policy: GeneralAssetPolicyV1;
  ownerSignature: `0x${string}`;
  evidence: GeneralAssetEvidenceArtifactV1;
  publish(value: { policy: GeneralAssetPolicyV1; ownerSignature: `0x${string}`;
    generalAssetEvidence: GeneralAssetEvidenceArtifactV1 }): Promise<unknown>;
}, repositories: {
  profiles: ReturnType<typeof createSolverProfileRepository>;
  runs: ReturnType<typeof createSolverRunRepository>;
  submissions: ReturnType<typeof createSolverSubmissionRepository>;
}) {
  const execution = readGeneralAssetV4Config().entries.find(
    ({ chainId }) => chainId === input.policy.sourceChainId,
  );
  if (!execution) throw new GeneralAssetPublicUnavailableError(
    "General asset V4 is not configured for this chain",
  );
  const verifierSigner = privateKeyToAccount(
    readCodingAgentV3ExecutionConfig().COBIA_VERIFIER_PRIVATE_KEY,
  ).address;
  const compiler = createOkxGeneralAssetSwapCompilerV1({ credentials: readOkxCredentials() });
  let compilation: Awaited<ReturnType<typeof compiler.compile>> | undefined;
  let compilationRequestHash: string | undefined;
  const compile: typeof compiler.compile = async (request) => {
    const requestHash = commitment(request);
    if (compilationRequestHash && compilationRequestHash !== requestHash) {
      throw new Error("General asset verification requested a different OKX compilation");
    }
    compilationRequestHash = requestHash;
    compilation ??= await compiler.compile(request);
    return compilation;
  };
  const nowSec = Math.floor(Date.now() / 1_000);
  try {
    return await publishAndRunGeneralAssetSolverV1({
      policy: input.policy,
      ownerSignature: input.ownerSignature,
      evidence: input.evidence,
      revision: 1,
      nowSec,
    }, {
      assertReady: assertProductionGeneralAssetPublicReadyV1,
      publish: input.publish,
      ...repositories,
      executor: execution.executor,
      verifierSigner,
      nowSec: () => Math.floor(Date.now() / 1_000),
      build: ({ policy, evidence }) => buildGeneralAssetDecisionV1({
        policy, evidence, executor: execution.executor,
        nowSec: () => Math.floor(Date.now() / 1_000), compile,
      }),
      verify: (value) => verifyProductionGeneralAssetDecisionV1(value, { compileSwap: compile }),
    });
  } catch (error) {
    if (error instanceof GeneralAssetPublicUnavailableError) throw error;
    if (error instanceof Error && /public-ready|not configured|adapter is unavailable/.test(error.message)) {
      throw new GeneralAssetPublicUnavailableError(
        "General asset V4 is awaiting public on-chain activation",
      );
    }
    throw error;
  }
}
