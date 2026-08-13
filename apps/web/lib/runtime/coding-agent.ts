import { commitment, type StablecoinPolicyV2 } from "@cobia/domain";
import {
  runCapabilitySandboxV1,
  verifyCapabilityProgramV1,
} from "@cobia/solvers";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "../chain/xlayer";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { productionCapabilityRegistryV1 } from "../capabilities/registry";
import { buildAtomicAuthorizationV2, signAtomicAuthorizationV2 } from "../atomic-execution/authorization-v2";
import { encodeAtomicExecutionCallV2 } from "../atomic-execution/encode-v2";
import { projectCapabilityProgramV2 } from "../atomic-execution/project-capability-program";
import type { AtomicExecutionProgramV2 } from "../atomic-execution/types-v2";
import { replayCapabilityProgramOnForkV1 } from "../coding-agent-sandbox/capability-fork-replay";
import { coordinateCapabilityProgramV1 } from "../coding-agent-sandbox/coordinator";
import { runOpenAiSandboxCodingAgent } from "../coding-agent-sandbox/openai-shell-agent";
import { captureCapabilityPortfolioV1, createCapabilityPortfolioReadV1 } from "../coding-agent-sandbox/portfolio";
import { startVercelAnvilForkV1 } from "../coding-agent-sandbox/vercel-anvil-fork";
import { startVercelCodingAgentSandbox } from "../coding-agent-sandbox/vercel-sandbox";
import { readCodingAgentRuntimeConfig } from "../env";
import { captureRouteSnapshotV2 } from "../orchestrator/capture-route-snapshot-v2";
import { createLiveRouteSnapshotDependencies } from "../orchestrator/route-snapshot-client";
import { runCodingAgentMarketV2 } from "../orchestrator/run-coding-agent-market-v2";
import type { createAgentProgramRepository } from "../db/agent-programs";
import type { createRequestRepository } from "../db/requests";

function brokerUrl(origin: string, jobId: string) {
  return new URL(`/api/internal/coding-agent/rpc/${jobId}`, origin).toString();
}

export async function openCodingAgentMarketV2(
  policy: StablecoinPolicyV2,
  repositories: {
    requests: ReturnType<typeof createRequestRepository>;
    programs: ReturnType<typeof createAgentProgramRepository>;
  },
) {
  const config = readCodingAgentRuntimeConfig();
  const executor = config.COBIA_EXECUTOR_V2_ADDRESS;
  const manifest = productionCapabilityManifestV1();
  const client = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
    cacheTime: 0,
  });
  const snapshotDependencies = createLiveRouteSnapshotDependencies(config.XLAYER_RPC_URL);
  const verifier = privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY);

  return runCodingAgentMarketV2(policy, {
    repository: repositories.requests,
    captureSnapshot: (input) => captureRouteSnapshotV2(input, snapshotDependencies),
    capturePortfolio: ({ owner, block }) => captureCapabilityPortfolioV1({
      owner, executor, block,
      read: createCapabilityPortfolioReadV1({ client: {
        getChainId: () => client.getChainId(),
        getBlock: ({ blockNumber }) => client.getBlock({ blockNumber }),
        readContract: (request) => client.readContract(request as never),
      } }),
    }),
    manifest,
    executor,
    coordinate: (input, dependencies) => coordinateCapabilityProgramV1(
      input,
      dependencies as Parameters<typeof coordinateCapabilityProgramV1>[1],
    ),
    coordinatorDependencies: {
      programs: repositories.programs,
      async runSandbox(input, jobId) {
        const url = brokerUrl(config.CODING_AGENT_PUBLIC_ORIGIN, jobId);
        const sandbox = await startVercelCodingAgentSandbox({ jobId, brokerUrl: url });
        return runCapabilitySandboxV1({
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
        return verifyCapabilityProgramV1({
          ...input,
          wallet: policy.owner,
          registry: productionCapabilityRegistryV1,
          nowSec: Math.floor(Date.now() / 1_000),
          async replay({ compiled }) {
            const job = await repositories.programs.getByRequestId(policy.requestId);
            if (!job) throw new Error("Agent program job is unavailable for replay");
            const url = brokerUrl(config.CODING_AGENT_PUBLIC_ORIGIN, job.id);
            const fork = await startVercelAnvilForkV1({
              jobId: job.id,
              brokerUrl: url,
              blockNumber: job.blockNumber,
            });
            try {
              return await replayCapabilityProgramOnForkV1({
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
        projectCapabilityProgramV2({ program, evidence, verification }),
      async attest({ execution, evidence }) {
        const program = execution as AtomicExecutionProgramV2;
        const authorization = buildAtomicAuthorizationV2(program, executor);
        const signature = await signAtomicAuthorizationV2({
          program,
          authorization,
          expectedExecutor: executor,
          signTypedData: (typedData) => verifier.signTypedData(typedData),
        });
        return {
          authorization,
          signature,
          call: encodeAtomicExecutionCallV2({
            program, authorization, signature, expectedExecutor: executor,
          }),
          attestor: verifier.address,
          evidenceHash: commitment(evidence),
        };
      },
    },
  });
}
