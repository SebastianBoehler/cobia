import {
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  commitment,
  type GeneralAssetPolicyV1,
  type GeneralAssetProgramV1,
} from "@cobia/domain";
import {
  GeneralAssetEvidenceArtifactV1Schema,
  type GeneralAssetEvidenceArtifactV1,
} from "@cobia/solvers";
import { createPublicClient, http, keccak256, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { createProductionGeneralAssetEligibilityV2 } from "../assets/production-general-asset-eligibility";
import { xLayer } from "../chain/xlayer";
import { replayGeneralAssetStageRemotely } from "../replay/remote-client";
import { createOkxGeneralAssetSwapCompilerV1 } from "../okx/general-asset-swap";
import type { GeneralAssetSwapCompileRequestV1 } from "../okx/general-asset-swap";
import {
  readCodingAgentV3ExecutionConfig,
  readGeneralAssetManifest,
  readGeneralAssetV4Config,
  readOkxCredentials,
} from "../env";
import { assertGeneralAssetV4Ready } from "./general-asset-v4-readiness";
import { verifyRuntimeGeneralAssetProposalV1 } from "./general-asset-verification";

function context(chainId: 1 | 196) {
  const executionConfig = readGeneralAssetV4Config().entries.find((entry) => entry.chainId === chainId);
  if (!executionConfig) throw new Error("General asset V4 execution chain is not configured");
  const execution = readCodingAgentV3ExecutionConfig();
  const client = createPublicClient({
    chain: chainId === 1 ? mainnet : xLayer,
    transport: http(chainId === 1 ? execution.ETHEREUM_RPC_URL : execution.XLAYER_RPC_URL,
      { timeout: 15_000 }),
    cacheTime: 0,
  });
  return { executionConfig, client, verifier: privateKeyToAccount(execution.COBIA_VERIFIER_PRIVATE_KEY),
    manifest: readGeneralAssetManifest() };
}

function exactEntry(input: {
  chainId: 1 | 196;
  manifest: ReturnType<typeof readGeneralAssetManifest>;
  program?: GeneralAssetProgramV1;
}) {
  const stage = input.program?.stages[0];
  const entry = input.manifest.entries.find((value) => value.chainId === input.chainId &&
    value.adapter.id === "okx.swap" && value.adapter.version === 1 &&
    (!stage || stage.calls.some(({ target }) => value.target === target)));
  if (!entry || entry.selectors.length < 1) throw new Error("General asset V4 adapter is unavailable");
  return entry;
}

export async function assertProductionGeneralAssetPublicReadyV1(input: {
  policy: GeneralAssetPolicyV1;
  evidence: GeneralAssetEvidenceArtifactV1;
}) {
  const policy = GeneralAssetPolicyV1Schema.parse(input.policy);
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.evidence);
  if (policy.sourceChainId !== policy.destinationChainId ||
      commitment(evidence.manifest) !== policy.manifestHash) {
    throw new Error("General asset V4 route is not public-ready");
  }
  const { executionConfig, client, verifier, manifest } = context(policy.sourceChainId);
  if (commitment(manifest) !== policy.manifestHash) {
    throw new Error("General asset V4 manifest is not public-ready");
  }
  const entry = exactEntry({ chainId: policy.sourceChainId, manifest });
  const block = await client.getBlock();
  if (!block.hash || block.number <= 0n) throw new Error("General asset V4 anchor is unavailable");
  await assertGeneralAssetV4Ready({ client: client as never, config: executionConfig,
    verifier: verifier.address, target: entry.target,
    selector: entry.selectors[0]! as `0x${string}`,
    blockNumber: block.number.toString() });
}

export async function verifyProductionGeneralAssetDecisionV1(input: {
  runId: string;
  policy: unknown;
  program: unknown;
  evidence: unknown;
  nowSec: number;
}, dependencies?: {
  compileSwap?(request: GeneralAssetSwapCompileRequestV1): ReturnType<
    ReturnType<typeof createOkxGeneralAssetSwapCompilerV1>["compile"]>;
}) {
  const policy = GeneralAssetPolicyV1Schema.parse(input.policy);
  const program = GeneralAssetProgramV1Schema.parse(input.program);
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(input.evidence);
  const chainId = program.stages[0]?.chainId;
  if (!chainId) throw new Error("General asset program has no execution chain");
  const contexts = new Map([...new Set(program.stages.map(({ chainId }) => chainId))]
    .map((exactChainId) => [exactChainId, context(exactChainId)]));
  const primary = contexts.get(chainId)!;
  const { executionConfig, verifier, manifest } = primary;
  const compiler = createOkxGeneralAssetSwapCompilerV1({ credentials: readOkxCredentials() });
  const eligibility = createProductionGeneralAssetEligibilityV2();
  const stage = program.stages[0]!;
  const identity = evidence.identities.find((value) =>
    commitment(value) === stage.input.identityEvidenceHash);
  const anchors = identity ? [{ chainId, blockNumber: identity.blockNumber,
    blockHash: identity.blockHash as Hash }] : [];
  return verifyRuntimeGeneralAssetProposalV1({ policy, program, manifest,
    identityEvidence: evidence.identities, valuationEvidence: evidence.valuations,
    anchors, nowSec: input.nowSec }, {
    executor: executionConfig.executor,
    executorCodeHash: executionConfig.executorCodeHash,
    executionFor: (exactChainId) => {
      const current = contexts.get(exactChainId);
      if (!current) throw new Error("General asset V4 execution chain is not configured");
      return { executor: current.executionConfig.executor,
        executorCodeHash: current.executionConfig.executorCodeHash };
    },
    nowSec: () => Math.floor(Date.now() / 1_000),
    refreshAsset: (value) => eligibility.eligibility(value),
    async getCodeHash(exactChainId, address: Address, blockNumber: string) {
      const current = contexts.get(exactChainId);
      if (!current) return undefined;
      const code = await current.client.getCode({ address, blockNumber: BigInt(blockNumber) });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    compileSwap: dependencies?.compileSwap ?? compiler.compile,
    replayStage: (exactStage, compiled, exactAnchor) => replayGeneralAssetStageRemotely({
      chainId: exactStage.chainId, blockNumber: exactAnchor.blockNumber, blockHash: exactAnchor.blockHash,
      owner: policy.owner as Address,
      executor: contexts.get(exactStage.chainId)!.executionConfig.executor,
      stage: exactStage, compiled,
    }),
    signTypedData: (typedData) => verifier.signTypedData(typedData),
    assertReady: (freshAnchor) => {
      const current = contexts.get(freshAnchor.chainId)!;
      return assertGeneralAssetV4Ready({
      client: current.client as never, config: current.executionConfig, verifier: current.verifier.address,
      blockNumber: freshAnchor.blockNumber,
    }); },
  });
}
