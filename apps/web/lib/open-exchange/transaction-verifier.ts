import { OpenIntentPolicyV3Schema, OpenIntentSnapshotV1Schema } from "@cobia/domain";
import {
  verifyOpenTransactionProgramV1, verifyRawWalletStageV1,
  type TransactionProgramEvidenceV1,
} from "@cobia/solvers";
import { createPublicClient, erc20Abi, keccak256 } from "viem";

type Client = ReturnType<typeof createPublicClient>;

export async function verifyOpenStagedProposalV1(input: {
  policy: unknown; snapshot: unknown; program: unknown; evidence: unknown;
  providerArtifacts: unknown; nowSec: number;
}, dependencies: {
  client: Client;
  replay(input: { program: unknown; evidence: unknown; providerArtifacts: unknown; snapshot: unknown }):
    Promise<{ reproduced: boolean; simulations: TransactionProgramEvidenceV1["simulations"] }>;
}) {
  const policy = OpenIntentPolicyV3Schema.parse(input.policy);
  const snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
  const verification = await verifyOpenTransactionProgramV1({ ...input,
    async confirmAnchor(anchor) {
      const block = await dependencies.client.getBlock({ blockNumber: BigInt(anchor.blockNumber) });
      return block.hash?.toLowerCase() === anchor.blockHash.toLowerCase();
    },
    async getCodeHash(chainId, address, blockNumber) {
      if (chainId !== 196) return undefined;
      const code = await dependencies.client.getCode({ address, blockNumber: BigInt(blockNumber) });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    async verifyProviderStage({ stage, artifact, anchor }) {
      if (stage.provider !== "evm.raw@1" || stage.chainId !== 196) {
        return { accepted: false as const, errorCodes: ["PROVIDER_UNSUPPORTED"] };
      }
      let currentAllowanceAtomic = "0";
      if (stage.approval) {
        currentAllowanceAtomic = (await dependencies.client.readContract({
          address: stage.approval.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [policy.owner, stage.approval.spender],
          blockNumber: BigInt(anchor.blockNumber),
        })).toString();
      }
      return verifyRawWalletStageV1({ stage, artifact: artifact.payload, currentAllowanceAtomic });
    },
    replay: ({ program, evidence, providerArtifacts }) => dependencies.replay({
      program, evidence, providerArtifacts, snapshot,
    }),
  });
  if (!verification.accepted) return verification;
  return { ...verification, execution: { version: 1 as const,
    kind: "wallet-call-batch" as const, owner: policy.owner,
    deadline: Math.min(policy.deadline, input.nowSec + policy.maxEvidenceAgeSec),
    stages: verification.stageAuthorizations,
    assurance: "exact-call-fork-replay" as const },
  };
}
