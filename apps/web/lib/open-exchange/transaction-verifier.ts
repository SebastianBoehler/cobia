import { OpenIntentPolicyV3Schema, OpenIntentSnapshotV1Schema } from "@cobia/domain";
import {
  verifyOpenTransactionProgramV1, verifyRawWalletStageV1,
  type TransactionProgramEvidenceV1,
} from "@cobia/solvers";
import { keccak256, type Address, type Hash, type Hex } from "viem";
import {
  instrumentCommitmentV1,
  resolveInstrumentV1,
} from "../instruments/production-registry";

export interface OpenProposalVerificationClientV1 {
  getBlock(input: { blockNumber: bigint }): Promise<{ hash: Hash | null }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readAllowance(input: { token: Address; owner: Address; spender: Address; blockNumber: bigint }):
    Promise<bigint>;
}

export async function verifyOpenStagedProposalV1(input: {
  policy: unknown; snapshot: unknown; program: unknown; evidence: unknown;
  providerArtifacts: unknown; nowSec: number;
}, dependencies: {
  clients: Readonly<Partial<Record<1 | 196 | 8453, OpenProposalVerificationClientV1>>>;
  replay(input: { program: unknown; evidence: unknown; providerArtifacts: unknown; snapshot: unknown }):
    Promise<{ reproduced: boolean; simulations: TransactionProgramEvidenceV1["simulations"] }>;
}) {
  const policy = OpenIntentPolicyV3Schema.parse(input.policy);
  const snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
  for (const outcome of policy.outcomes) {
    if (outcome.kind !== "registered-instrument") continue;
    try {
      const instrument = resolveInstrumentV1({
        chainId: outcome.chainId,
        token: outcome.token,
        jurisdiction: outcome.jurisdiction,
        nowSec: input.nowSec,
      });
      if (instrumentCommitmentV1(instrument) !== outcome.instrumentCommitment) {
        return { accepted: false as const, errorCodes: ["INSTRUMENT_IDENTITY_CHANGED"] };
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code) : "INSTRUMENT_NOT_REGISTERED";
      return { accepted: false as const, errorCodes: [code] };
    }
  }
  const client = (chainId: 1 | 196 | 8453) => {
    const value = dependencies.clients[chainId];
    if (!value) throw new Error(`Chain ${chainId} verifier client is unavailable`);
    return value;
  };
  const verification = await verifyOpenTransactionProgramV1({ ...input,
    async confirmAnchor(anchor) {
      const block = await client(anchor.chainId).getBlock({ blockNumber: BigInt(anchor.blockNumber) });
      return block.hash?.toLowerCase() === anchor.blockHash.toLowerCase();
    },
    async getCodeHash(chainId, address, blockNumber) {
      const code = await client(chainId).getCode({ address, blockNumber: BigInt(blockNumber) });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    async verifyProviderStage({ stage, artifact, anchor }) {
      if (stage.provider !== "evm.raw@1") {
        return { accepted: false as const, errorCodes: ["PROVIDER_UNSUPPORTED"] };
      }
      let currentAllowanceAtomic = "0";
      if (stage.approval) {
        currentAllowanceAtomic = (await client(stage.chainId).readAllowance({
          token: stage.approval.token, owner: policy.owner, spender: stage.approval.spender,
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
