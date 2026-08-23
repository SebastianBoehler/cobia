import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import { buildGeneralAssetDecisionV1 } from "@cobia/solvers";
import { createOkxGeneralAssetSwapCompilerV1 } from
  "../../../apps/web/lib/okx/general-asset-swap";
import { readGeneralAssetV4Config, readOkxCredentials } from "../../../apps/web/lib/env";

export async function solveGeneralAssetIntent(
  intent: SolverIntentV1,
): Promise<SolverDecisionV1> {
  if (intent.policy.kind !== "general-asset" ||
      intent.snapshot.kind !== "general-asset-evidence") {
    return { version: 1, decision: "abstain", reasonCode: "GENERAL_ASSET_EVIDENCE_MISMATCH" };
  }
  try {
    const policy = intent.policy;
    const evidence = intent.snapshot;
    const runtime = readGeneralAssetV4Config().entries.find(({ chainId }) =>
      chainId === policy.sourceChainId);
    if (!runtime) throw new Error("General asset executor is unavailable on the source chain");
    const compiler = createOkxGeneralAssetSwapCompilerV1({
      credentials: readOkxCredentials(),
    });
    return await buildGeneralAssetDecisionV1({
      policy,
      evidence,
      executor: runtime.executor,
      nowSec: Math.floor(Date.now() / 1_000),
      compile: compiler.compile,
    });
  } catch {
    return { version: 1, decision: "abstain", reasonCode: "NO_VERIFIED_GENERAL_ASSET_ROUTE" };
  }
}
