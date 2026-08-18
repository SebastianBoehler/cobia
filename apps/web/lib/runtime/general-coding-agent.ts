import { commitment, type GeneralIntentPolicyV2, type GeneralIntentSnapshotV1 } from "@cobia/domain";
import { runCapabilitySandboxV2, verifyCapabilityProgramV2, type StaticReadCallerV1 } from "@cobia/solvers";
import { createPublicClient, http, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "../chain/xlayer";
import { buildAtomicAuthorizationV3, signAtomicAuthorizationV3 } from "../atomic-execution/authorization-v3";
import { encodeAtomicExecutionCallV3 } from "../atomic-execution/encode-v3";
import { projectCapabilityProgramV3 } from "../atomic-execution/project-capability-program-v3";
import type { AtomicExecutionProgramV3 } from "../atomic-execution/types-v3";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { productionCapabilityRegistryV1 } from "../capabilities/registry";
import { replayCapabilityProgramOnForkV2 } from "../coding-agent-sandbox/capability-fork-replay-v2";
import {
  assertAgentExecutorReadyV1,
  createAgentExecutorReadV1,
} from "../coding-agent-sandbox/executor-preflight";
import { runOpenAiSandboxCodingAgent } from "../coding-agent-sandbox/openai-shell-agent";
import { captureCapabilityPortfolioV1, createCapabilityPortfolioReadV1 } from "../coding-agent-sandbox/portfolio";
import { startVercelAnvilForkV2 } from "../coding-agent-sandbox/vercel-anvil-fork";
import { startVercelCodingAgentSandbox } from "../coding-agent-sandbox/vercel-sandbox";
import type { createIntentRepository } from "../db/intents";
import type { createSolverProfileRepository } from "../db/solver-profiles";
import type { createSolverRunRepository } from "../db/solver-runs";
import type { createSolverSubmissionRepository } from "../db/solver-submissions";
import { readCodingAgentV3RuntimeConfig } from "../env";
import { runGeneralCodingAgentCompetition } from "../orchestrator/run-general-coding-agent-market";
import { assertPolicyTargetsActiveManifest } from "./active-capabilities";

function brokerUrl(origin: string, jobId: string) {
  return new URL(`/api/internal/coding-agent/rpc/${jobId}`, origin).toString();
}

function staticCaller(input: {
  client: ReturnType<typeof createPublicClient>;
  blockNumber: bigint;
}): StaticReadCallerV1 {
  return {
    async getCodeHash(target) {
      const code = await input.client.getCode({ address: target, blockNumber: input.blockNumber });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    async call({ target, data, gasLimit }) {
      try {
        const result = await input.client.call({
          to: target,
          data,
          gas: BigInt(gasLimit),
          blockNumber: input.blockNumber,
        });
        return { success: true, returnData: (result.data ?? "0x") as Hex };
      } catch {
        return { success: false, returnData: "0x" };
      }
    },
  };
}

async function captureSnapshot(
  policy: GeneralIntentPolicyV2,
  client: ReturnType<typeof createPublicClient>,
): Promise<GeneralIntentSnapshotV1> {
  if (await client.getChainId() !== 196) throw new Error("General intent RPC is not X Layer mainnet");
  const block = await client.getBlock();
  if (!block.hash || block.number <= 0n) throw new Error("X Layer returned an invalid anchor block");
  return {
    version: 1,
    kind: "general-onchain",
    requestId: policy.requestId,
    chainId: 196,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    capturedAt: new Date(Number(block.timestamp) * 1_000).toISOString(),
    manifestHash: policy.manifestHash,
  };
}

export async function openGeneralCodingAgentCompetition(
  input: {
    policy: GeneralIntentPolicyV2;
    ownerSignature: `0x${string}`;
    revision: number;
    observedAtSec: number;
  },
  repositories: {
    intents: ReturnType<typeof createIntentRepository>;
    profiles: ReturnType<typeof createSolverProfileRepository>;
    runs: ReturnType<typeof createSolverRunRepository>;
    submissions: ReturnType<typeof createSolverSubmissionRepository>;
  },
) {
  const { policy } = input;
  const config = readCodingAgentV3RuntimeConfig();
  const executor = config.COBIA_EXECUTOR_V3_ADDRESS;
  const manifest = productionCapabilityManifestV1();
  assertPolicyTargetsActiveManifest(policy, manifest);
  const client = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
    cacheTime: 0,
  });
  const verifier = privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY);

  return runGeneralCodingAgentCompetition(input, {
    repositories,
    assertReady: () => assertAgentExecutorReadyV1({
      executor,
      expectedCodeHash: config.COBIA_EXECUTOR_V3_CODE_HASH,
      expectedVerifier: verifier.address,
      owner: policy.owner,
      inputToken: policy.input.token,
      inputAmount: BigInt(policy.input.maxAtomic),
      read: createAgentExecutorReadV1(client),
    }),
    captureSnapshot: (value) => captureSnapshot(value, client),
    capturePortfolio: ({ owner, block }) => captureCapabilityPortfolioV1({
      owner,
      executor,
      block,
      read: createCapabilityPortfolioReadV1({ client: {
        getChainId: () => client.getChainId(),
        getBlock: ({ blockNumber }) => client.getBlock({ blockNumber }),
        readContract: (request) => client.readContract(request as never),
      } }),
    }),
    manifest,
    executor,
    coordinatorDependencies: {
      async runSandbox(input, jobId) {
        const url = brokerUrl(config.CODING_AGENT_PUBLIC_ORIGIN, jobId);
        const sandbox = await startVercelCodingAgentSandbox({ jobId, brokerUrl: url });
        return runCapabilitySandboxV2({
          sandbox,
          generate: (environment) => runOpenAiSandboxCodingAgent({
            apiKey: config.OPENAI_API_KEY,
            model: config.OPENAI_CODING_AGENT_MODEL,
            sandbox: environment,
          }),
          policy: input.policy,
          snapshot: input.snapshot,
          wallet: input.job.owner,
          portfolio: input.portfolio,
          manifest: input.manifest,
          executor,
        });
      },
      async verify(input) {
        const snapshot = input.snapshot as GeneralIntentSnapshotV1;
        const blockNumber = BigInt(snapshot.blockNumber);
        return verifyCapabilityProgramV2({
          ...input,
          wallet: policy.owner,
          executor,
          registry: productionCapabilityRegistryV1,
          nowSec: Math.floor(Date.now() / 1_000),
          staticCaller: staticCaller({ client, blockNumber }),
          async confirmAnchor(anchor) {
            const block = await client.getBlock({ blockNumber: BigInt(anchor.blockNumber) });
            return block.hash?.toLowerCase() === anchor.blockHash.toLowerCase();
          },
          async replay({ compiled }) {
            const url = brokerUrl(config.CODING_AGENT_PUBLIC_ORIGIN, input.runId);
            const fork = await startVercelAnvilForkV2({
              jobId: input.runId,
              brokerUrl: url,
              blockNumber: snapshot.blockNumber,
            });
            try {
              return await replayCapabilityProgramOnForkV2({
                program: input.program,
                compiled,
                forkRpc: fork.rpc,
                read: fork.read,
              });
            } finally {
              await fork.stop();
            }
          },
        });
      },
      project: ({ program, evidence, verification }) =>
        projectCapabilityProgramV3({ program, evidence, verification }),
      async attest({ execution, evidence }) {
        const program = execution as AtomicExecutionProgramV3;
        const authorization = buildAtomicAuthorizationV3(program, executor);
        const signature = await signAtomicAuthorizationV3({
          program,
          authorization,
          expectedExecutor: executor,
          signTypedData: (typedData) => verifier.signTypedData(typedData),
        });
        return {
          version: 3,
          authorization,
          signature,
          call: encodeAtomicExecutionCallV3({ program, authorization, signature, expectedExecutor: executor }),
          attestor: verifier.address,
          evidenceHash: commitment(evidence),
        };
      },
    },
  });
}
