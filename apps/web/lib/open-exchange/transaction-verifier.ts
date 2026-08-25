import { OpenIntentPolicyV3Schema, OpenIntentSnapshotV1Schema } from "@cobia/domain";
import {
  XLAYER_OKX_MANIFEST_V1, authorizeOkxSwapStageV1,
  verifyOpenTransactionProgramV1, verifyRawWalletStageV1,
  type OkxSwapSimulationV1, type TransactionProgramEvidenceV1,
} from "@cobia/solvers";
import { isAddressEqual, keccak256, type Address, type Hash, type Hex } from "viem";
import { verifyRegisteredInstrumentIdentityV1 } from "../instruments/verify-identity";

export interface OpenProposalVerificationClientV1 {
  getBlock(input: { blockNumber: bigint }): Promise<{ hash: Hash | null }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readAllowance(input: { token: Address; owner: Address; spender: Address; blockNumber: bigint }):
    Promise<bigint>;
}

interface OkxStageProjectionV1 {
  id: string;
  sender: Address;
  input: { token: Address };
  output: { token: Address };
  approval?: { token: Address; spender: Address };
  transaction: { dataHash: Hash };
}

export function okxSimulationFromEvidenceV1(
  stage: OkxStageProjectionV1,
  evidence: TransactionProgramEvidenceV1,
): OkxSwapSimulationV1 | undefined {
  const simulation = evidence.simulations.find(({ stageId }) => stageId === stage.id);
  if (!simulation) return undefined;
  const ownerDeltas = simulation.assetDeltas.filter(({ account }) =>
    isAddressEqual(account, stage.sender));
  const delta = (token: Address) => ownerDeltas.find((item) =>
    isAddressEqual(item.token, token))?.deltaAtomic;
  const inputDelta = BigInt(delta(stage.input.token) ?? "0");
  const outputDelta = BigInt(delta(stage.output.token) ?? "0");
  const allowance = stage.approval ? simulation.allowanceDeltas.find((item) =>
    isAddressEqual(item.token, stage.approval!.token) &&
    isAddressEqual(item.owner, stage.sender) &&
    isAddressEqual(item.spender, stage.approval!.spender)) : undefined;
  return {
    reproduced: true,
    transactionSuccess: simulation.success,
    completeOwnerAssetDiff: simulation.completeAssetCoverage,
    transactionDataHash: simulation.transactionDataHash,
    gasUsed: simulation.gasUsed,
    observedInputDecreaseAtomic: inputDelta < 0n ? (-inputDelta).toString() : "0",
    observedOutputIncreaseAtomic: outputDelta > 0n ? outputDelta.toString() : "0",
    unexpectedOwnerAssetDecreases: ownerDeltas.filter(({ token, deltaAtomic }) =>
      BigInt(deltaAtomic) < 0n && !isAddressEqual(token, stage.input.token))
      .map(({ token }) => token).sort(),
    residualAllowanceAtomic: stage.approval ? allowance?.afterAtomic ?? "1" : "0",
    traceHash: simulation.traceHash,
    stateDiffHash: simulation.stateDiffHash,
  };
}

export async function verifyOpenStagedProposalV1(input: {
  policy: unknown; snapshot: unknown; program: unknown; evidence?: unknown;
  providerArtifacts: unknown; nowSec: number;
}, dependencies: {
  clients: Readonly<Partial<Record<1 | 196 | 8453, OpenProposalVerificationClientV1>>>;
  replay(input: { program: unknown; evidence?: unknown; providerArtifacts: unknown; snapshot: unknown }):
    Promise<{ reproduced: boolean; simulations: TransactionProgramEvidenceV1["simulations"] }>;
}) {
  const policy = OpenIntentPolicyV3Schema.parse(input.policy);
  const snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
  const client = (chainId: 1 | 196 | 8453) => {
    const value = dependencies.clients[chainId];
    if (!value) throw new Error(`Chain ${chainId} verifier client is unavailable`);
    return value;
  };
  const codeHash = async (chainId: 1 | 196 | 8453, address: Address, blockNumber: bigint) => {
    const code = await client(chainId).getCode({ address, blockNumber });
    return !code || code === "0x" ? undefined : keccak256(code);
  };
  for (const outcome of policy.outcomes) {
    if (outcome.kind !== "registered-instrument") continue;
    if (outcome.chainId !== 1 && outcome.chainId !== 196) {
      return { accepted: false as const, errorCodes: ["INSTRUMENT_NOT_REGISTERED"] };
    }
    const instrumentChainId: 1 | 196 = outcome.chainId;
    const anchor = snapshot.anchors.find(({ chainId }) => chainId === instrumentChainId);
    if (!anchor) return { accepted: false as const, errorCodes: ["INSTRUMENT_ANCHOR_MISSING"] };
    const identity = await verifyRegisteredInstrumentIdentityV1({
      chainId: instrumentChainId, token: outcome.token, jurisdiction: outcome.jurisdiction,
      instrumentCommitment: outcome.instrumentCommitment,
      nowSec: input.nowSec, blockNumber: BigInt(anchor.blockNumber),
    }, { getCodeHash: codeHash });
    if (!identity.accepted) return identity;
  }
  const verification = await verifyOpenTransactionProgramV1({ ...input,
    async confirmAnchor(anchor) {
      const block = await client(anchor.chainId).getBlock({ blockNumber: BigInt(anchor.blockNumber) });
      return block.hash?.toLowerCase() === anchor.blockHash.toLowerCase();
    },
    async getCodeHash(chainId, address, blockNumber) {
      return codeHash(chainId, address, BigInt(blockNumber));
    },
    async verifyProviderStage({ stage, artifact, anchor }) {
      if (stage.provider !== "evm.raw@1" && stage.provider !== "okx.dex@1") {
        return { accepted: false as const, errorCodes: ["PROVIDER_UNSUPPORTED"] };
      }
      let currentAllowanceAtomic = "0";
      if (stage.approval) {
        currentAllowanceAtomic = (await client(stage.chainId).readAllowance({
          token: stage.approval.token, owner: policy.owner, spender: stage.approval.spender,
          blockNumber: BigInt(anchor.blockNumber),
        })).toString();
      }
      if (stage.provider === "evm.raw@1") {
        return verifyRawWalletStageV1({ stage, artifact: artifact.payload, currentAllowanceAtomic });
      }
      return authorizeOkxSwapStageV1({ stage, artifact: artifact.payload,
        manifest: XLAYER_OKX_MANIFEST_V1, nowSec: input.nowSec, currentAllowanceAtomic });
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
