import { TransactionProgramV1Schema, commitment } from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import {
  ProviderArtifactsV1Schema,
  TransactionProgramEvidenceV1Schema,
  type ProviderArtifactV1,
} from "@cobia/solvers";
import { captureOpenTransactionProgramSimulationsV1 } from
  "../../../apps/web/lib/open-exchange/transaction-fork-replay";
import { startLocalFork } from "./local-fork";

export async function finalizeXLayerTransaction(input: {
  intent: SolverIntentV1;
  stages: unknown[];
  artifacts: ProviderArtifactV1[];
  runner: string;
  nowSec: number;
}): Promise<SolverDecisionV1> {
  if (input.intent.policy.kind !== "open-onchain" ||
      input.intent.snapshot.kind !== "open-onchain") {
    return { version: 1, decision: "abstain", reasonCode: "SNAPSHOT_KIND_MISMATCH" };
  }
  const anchor = input.intent.snapshot.anchors.find(({ chainId }) => chainId === 196);
  const upstreamRpc = process.env.XLAYER_RPC_URL;
  if (!anchor || !upstreamRpc) {
    return { version: 1, decision: "abstain", reasonCode: "REFERENCE_RUNTIME_UNAVAILABLE" };
  }
  const stageExpiry = Math.min(...input.stages.map((stage) =>
    Number((stage as { expiresAt: number }).expiresAt)));
  const deadline = Math.min(input.intent.policy.deadline, stageExpiry);
  if (deadline <= input.nowSec) {
    return { version: 1, decision: "abstain", reasonCode: "SNAPSHOT_EXPIRED" };
  }
  const program = TransactionProgramV1Schema.parse({
    version: 1, programId: crypto.randomUUID(), requestId: input.intent.id,
    policyHash: commitment(input.intent.policy), owner: input.intent.policy.owner,
    createdAt: input.nowSec, deadline, maxEvidenceAgeSec: input.intent.policy.maxEvidenceAgeSec,
    stages: input.stages,
  });
  const providerArtifacts = ProviderArtifactsV1Schema.parse({
    version: 1, artifacts: input.artifacts,
  });
  const fork = await startLocalFork({ upstreamRpc, blockNumber: anchor.blockNumber,
    ...(process.env.ANVIL_PORT ? { port: Number(process.env.ANVIL_PORT) } : {}) });
  try {
    const simulations = await captureOpenTransactionProgramSimulationsV1({
      program, providerArtifacts, snapshot: input.intent.snapshot, rpc: fork.rpc,
    });
    const evidence = TransactionProgramEvidenceV1Schema.parse({
      version: 1, programHash: commitment(program), capturedAt: input.nowSec, simulations,
    });
    return { version: 1, decision: "submit", proposalKind: "transaction-program",
      program, evidence, providerArtifacts,
      provenance: { version: 1, runner: input.runner,
        dependencies: [{ name: "anvil", version: "1.7.1" }], sources: [],
        commandHashes: [], generatedFiles: [] } };
  } finally {
    await fork.stop();
  }
}
