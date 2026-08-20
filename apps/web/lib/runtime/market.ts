import { OpenIntentPolicyV3Schema, type GeneralIntentPolicyV2, type OpenIntentPolicyV3 } from "@cobia/domain";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createDatabase } from "../db/client";
import { createActivityRepository } from "../db/activity";
import { createIntentRepository } from "../db/intents";
import { createChallengeRepository } from "../db/challenges";
import { createCommerceOfferRepository } from "../db/commerce-offers";
import { createCommercePlacementRepository } from "../db/commerce-placements";
import { createSolverProfileRepository } from "../db/solver-profiles";
import { createSolverRunRepository } from "../db/solver-runs";
import { createSolverSubmissionRepository } from "../db/solver-submissions";
import { createOpenIntentSnapshotRepository } from "../db/open-intent-snapshots";
import { createSolverDecisionClaimRepository } from "../db/solver-decision-claims";
import { createSolverSuccessFeeRepository } from "../db/solver-success-fees";
import { readCodingAgentV3RuntimeConfig, readDatabaseUrl } from "../env";
import { openGeneralCodingAgentCompetition } from "./general-coding-agent";
import { cobiaCodingAgentProfile } from "./solver-catalog";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import {
  ActiveManifestMismatchError,
  assertPolicyTargetsActiveManifest,
} from "./active-capabilities";
import { readMarketConfig } from "../env";
import { xLayer } from "../chain/xlayer";
import { captureOpenIntentSnapshotV1 } from "../open-exchange/capture-snapshot";
import { createOpenDecisionIntakeV1 } from "../open-exchange/decision-intake";
import { verifyOpenCapabilityProposalV1 } from "../open-exchange/capability-verifier";
import { verifyOpenStagedProposalV1 } from "../open-exchange/transaction-verifier";
import { replayOpenTransactionProgramV1 } from "../open-exchange/transaction-fork-replay";
import {
  assertAgentExecutorReadyV1, createAgentExecutorReadV1,
} from "../coding-agent-sandbox/executor-preflight";
import { startVercelAnvilForkV2 } from "../coding-agent-sandbox/vercel-anvil-fork";
import { replayCapabilityProgramOnForkV2 } from "../coding-agent-sandbox/capability-fork-replay-v2";

let activityRepository: ReturnType<typeof createActivityRepository> | undefined;
let database: ReturnType<typeof createDatabase> | undefined;
let intentRepository: ReturnType<typeof createIntentRepository> | undefined;
let challengeRepository: ReturnType<typeof createChallengeRepository> | undefined;
let commerceOfferRepository: ReturnType<typeof createCommerceOfferRepository> | undefined;
let commercePlacementRepository: ReturnType<typeof createCommercePlacementRepository> | undefined;
let solverProfileRepository: ReturnType<typeof createSolverProfileRepository> | undefined;
let solverRunRepository: ReturnType<typeof createSolverRunRepository> | undefined;
let solverSubmissionRepository: ReturnType<typeof createSolverSubmissionRepository> | undefined;
let openIntentSnapshotRepository: ReturnType<typeof createOpenIntentSnapshotRepository> | undefined;
let solverDecisionClaimRepository: ReturnType<typeof createSolverDecisionClaimRepository> | undefined;
let solverSuccessFeeRepository: ReturnType<typeof createSolverSuccessFeeRepository> | undefined;

function getDatabase() {
  database ??= createDatabase(readDatabaseUrl());
  return database.db;
}

export function getActivityRepository() {
  activityRepository ??= createActivityRepository(getDatabase());
  return activityRepository;
}

export function getIntentRepository() {
  intentRepository ??= createIntentRepository(getDatabase());
  return intentRepository;
}

export function getChallengeRepository() {
  challengeRepository ??= createChallengeRepository(getDatabase());
  return challengeRepository;
}

export function getCommerceOfferRepository() {
  commerceOfferRepository ??= createCommerceOfferRepository(getDatabase());
  return commerceOfferRepository;
}

export function getCommercePlacementRepository() {
  commercePlacementRepository ??= createCommercePlacementRepository(getDatabase());
  return commercePlacementRepository;
}

export function getSolverProfileRepository() {
  solverProfileRepository ??= createSolverProfileRepository(getDatabase());
  return solverProfileRepository;
}

export function getSolverRunRepository() {
  solverRunRepository ??= createSolverRunRepository(getDatabase());
  return solverRunRepository;
}

export function getSolverSubmissionRepository() {
  solverSubmissionRepository ??= createSolverSubmissionRepository(getDatabase());
  return solverSubmissionRepository;
}

export function getOpenIntentSnapshotRepository() {
  openIntentSnapshotRepository ??= createOpenIntentSnapshotRepository(getDatabase());
  return openIntentSnapshotRepository;
}

export function getSolverDecisionClaimRepository() {
  solverDecisionClaimRepository ??= createSolverDecisionClaimRepository(getDatabase());
  return solverDecisionClaimRepository;
}

export function getSolverSuccessFeeRepository() {
  solverSuccessFeeRepository ??= createSolverSuccessFeeRepository(getDatabase());
  return solverSuccessFeeRepository;
}

export function openGeneralIntentMarket(input: {
  policy: GeneralIntentPolicyV2;
  ownerSignature: `0x${string}`;
  revision: number;
  observedAtSec: number;
}) {
  return openGeneralCodingAgentCompetition(input, {
    intents: getIntentRepository(),
    profiles: getSolverProfileRepository(),
    runs: getSolverRunRepository(),
    submissions: getSolverSubmissionRepository(),
  });
}

export { ActiveManifestMismatchError };

export async function publishGeneralIntent(input: {
  policy: GeneralIntentPolicyV2;
  ownerSignature: `0x${string}`;
}) {
  assertPolicyTargetsActiveManifest(input.policy, productionCapabilityManifestV1());
  await getSolverProfileRepository().register(cobiaCodingAgentProfile);
  return getIntentRepository().create(input);
}

export async function publishOpenIntent(input: {
  policy: OpenIntentPolicyV3;
  ownerSignature: `0x${string}`;
}) {
  const config = readMarketConfig();
  const client = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
    cacheTime: 0,
  });
  const snapshot = await captureOpenIntentSnapshotV1(input.policy, client);
  const intent = await getIntentRepository().create(input);
  await getOpenIntentSnapshotRepository().create(snapshot);
  return { intent, snapshot };
}

export function submitOpenSolverDecision(value: {
  claim: unknown; signature: string; decision: unknown;
}) {
  const config = readCodingAgentV3RuntimeConfig();
  const client = createPublicClient({ chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0 });
  const verifier = privateKeyToAccount(config.COBIA_VERIFIER_PRIVATE_KEY);
  const intake = createOpenDecisionIntakeV1({
    intents: getIntentRepository(),
    snapshots: getOpenIntentSnapshotRepository(),
    profiles: getSolverProfileRepository(),
    claims: getSolverDecisionClaimRepository(),
    runs: getSolverRunRepository(),
    submissions: getSolverSubmissionRepository(),
    nowSec: () => Math.floor(Date.now() / 1_000),
    async verify(input) {
      if (input.proposalKind === "transaction-program") {
        return verifyOpenStagedProposalV1({ ...input,
          providerArtifacts: input.providerArtifacts }, {
          client,
          async replay(replayInput) {
            const snapshot = replayInput.snapshot as { anchors?: { chainId: number; blockNumber: string }[] };
            const anchor = snapshot.anchors?.find(({ chainId }) => chainId === 196);
            if (!anchor) throw new Error("X Layer replay anchor is unavailable");
            const broker = new URL(`/api/internal/coding-agent/rpc/${input.runId}`,
              config.CODING_AGENT_PUBLIC_ORIGIN).toString();
            const fork = await startVercelAnvilForkV2({ jobId: input.runId,
              brokerUrl: broker, blockNumber: anchor.blockNumber });
            try { return await replayOpenTransactionProgramV1({ ...replayInput, rpc: fork.rpc }); }
            finally { await fork.stop(); }
          },
        });
      }
      const policy = OpenIntentPolicyV3Schema.parse(input.policy);
      return verifyOpenCapabilityProposalV1({ ...input, policy }, {
        client,
        executor: config.COBIA_EXECUTOR_V3_ADDRESS,
        attestor: verifier.address,
        assertReady: ({ owner, inputToken, inputAmount }) => assertAgentExecutorReadyV1({
          executor: config.COBIA_EXECUTOR_V3_ADDRESS,
          expectedCodeHash: config.COBIA_EXECUTOR_V3_CODE_HASH,
          expectedVerifier: verifier.address,
          owner, inputToken, inputAmount,
          read: createAgentExecutorReadV1(client),
        }),
        async replay(replayInput) {
          const broker = new URL(
            `/api/internal/coding-agent/rpc/${replayInput.runId}`,
            config.CODING_AGENT_PUBLIC_ORIGIN,
          ).toString();
          const fork = await startVercelAnvilForkV2({ jobId: replayInput.runId,
            brokerUrl: broker, blockNumber: replayInput.blockNumber });
          try {
            return await replayCapabilityProgramOnForkV2({ program: replayInput.program,
              compiled: replayInput.compiled, forkRpc: fork.rpc, read: fork.read });
          } finally { await fork.stop(); }
        },
        signTypedData: (typedData) => verifier.signTypedData(typedData),
      });
    },
  });
  return intake.submit(value);
}
