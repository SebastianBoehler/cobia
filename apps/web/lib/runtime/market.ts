import {
  projectRouteQuote,
  verifyBundle,
  type PersistedStablecoinPolicy,
  type GeneralIntentPolicyV2,
  type StablecoinPolicy,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  createDeterministicSolver,
} from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import { createXLayerBlockReader } from "../chain/xlayer";
import { createDatabase } from "../db/client";
import { createActivityRepository } from "../db/activity";
import { createPurchaseRepository } from "../db/purchases";
import { createMarketRepository } from "../db/markets";
import { createPaymentRepository } from "../db/payments";
import { createRequestRepository } from "../db/requests";
import { createRehearsalRepository } from "../db/rehearsals";
import { createExecutionRepository } from "../db/executions";
import { createAgentProgramRepository } from "../db/agent-programs";
import { createIntentRepository } from "../db/intents";
import { createChallengeRepository } from "../db/challenges";
import { createSolverProfileRepository } from "../db/solver-profiles";
import { createSolverRunRepository } from "../db/solver-runs";
import { createSolverSubmissionRepository } from "../db/solver-submissions";
import {
  readDatabaseUrl,
  readMarketConfig,
  readOkxCredentials,
} from "../env";
import { createOkxClient } from "../okx/client";
import { captureSnapshot } from "../orchestrator/capture-snapshot";
import { runQuoteMarket } from "../orchestrator/run-market";
import { openCodingAgentMarketV2 } from "./coding-agent";
import { openGeneralCodingAgentCompetition } from "./general-coding-agent";
import { cobiaCodingAgentProfile } from "./solver-catalog";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import {
  ActiveManifestMismatchError,
  assertPolicyTargetsActiveManifest,
} from "./active-capabilities";

let repository: ReturnType<typeof createRequestRepository> | undefined;
let activityRepository: ReturnType<typeof createActivityRepository> | undefined;
let purchaseRepository: ReturnType<typeof createPurchaseRepository> | undefined;
let database: ReturnType<typeof createDatabase> | undefined;
let marketRepository: ReturnType<typeof createMarketRepository> | undefined;
let paymentRepository: ReturnType<typeof createPaymentRepository> | undefined;
let rehearsalRepository: ReturnType<typeof createRehearsalRepository> | undefined;
let executionRepository: ReturnType<typeof createExecutionRepository> | undefined;
let agentProgramRepository: ReturnType<typeof createAgentProgramRepository> | undefined;
let intentRepository: ReturnType<typeof createIntentRepository> | undefined;
let challengeRepository: ReturnType<typeof createChallengeRepository> | undefined;
let solverProfileRepository: ReturnType<typeof createSolverProfileRepository> | undefined;
let solverRunRepository: ReturnType<typeof createSolverRunRepository> | undefined;
let solverSubmissionRepository: ReturnType<typeof createSolverSubmissionRepository> | undefined;

function getDatabase() {
  database ??= createDatabase(readDatabaseUrl());
  return database.db;
}

export function getRequestRepository() {
  if (repository) return repository;
  repository = createRequestRepository(getDatabase());
  return repository;
}

export function getActivityRepository() {
  activityRepository ??= createActivityRepository(getDatabase());
  return activityRepository;
}

export function getPurchaseRepository() {
  purchaseRepository ??= createPurchaseRepository(getDatabase());
  return purchaseRepository;
}

export function getMarketRepository() {
  marketRepository ??= createMarketRepository(getDatabase());
  return marketRepository;
}

export function getPaymentRepository() {
  paymentRepository ??= createPaymentRepository(getDatabase());
  return paymentRepository;
}

export function getRehearsalRepository() {
  rehearsalRepository ??= createRehearsalRepository(getDatabase());
  return rehearsalRepository;
}

export function getExecutionRepository() {
  executionRepository ??= createExecutionRepository(getDatabase());
  return executionRepository;
}

export function getAgentProgramRepository() {
  agentProgramRepository ??= createAgentProgramRepository(getDatabase());
  return agentProgramRepository;
}

export function getIntentRepository() {
  intentRepository ??= createIntentRepository(getDatabase());
  return intentRepository;
}

export function getChallengeRepository() {
  challengeRepository ??= createChallengeRepository(getDatabase());
  return challengeRepository;
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

async function openQuoteMarketV1(policy: StablecoinPolicy) {
  const config = readMarketConfig();
  const requests = getRequestRepository();
  const okx = createOkxClient({ credentials: readOkxCredentials() });
  const solvers = [
    createDeterministicSolver({
      solverId: "deterministic",
      account: privateKeyToAccount(config.DETERMINISTIC_SOLVER_PRIVATE_KEY),
    }),
  ];
  await requests.createRequest(policy);
  try {
    return await runQuoteMarket(policy, {
      captureSnapshot: (input) => captureSnapshot(input, {
        okx,
        blocks: createXLayerBlockReader(config.XLAYER_RPC_URL),
      }),
      solvers,
      saveSnapshot: (snapshot) => requests.saveSnapshot(policy.requestId, snapshot),
      saveQuote: (bundle, verdict, quote) =>
        requests.saveQuote(policy.requestId, bundle, verdict, quote),
      finish: (state) => requests.finishMarket(policy.requestId, state),
      verify: verifyBundle,
      project: projectRouteQuote,
      nowSec: () => Math.floor(Date.now() / 1_000),
      quotePriceAtomic: "100000",
    });
  } catch (error) {
    await requests.failRequest(policy.requestId);
    throw error;
  }
}

async function openQuoteMarketV2(policy: StablecoinPolicyV2) {
  return openCodingAgentMarketV2(policy, {
    requests: getRequestRepository(),
    programs: getAgentProgramRepository(),
  });
}

export function openQuoteMarket(policy: PersistedStablecoinPolicy) {
  return policy.version === 1
    ? openQuoteMarketV1(policy)
    : openQuoteMarketV2(policy);
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
