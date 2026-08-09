import { projectRouteQuote, verifyBundle, type StablecoinPolicy } from "@cobia/domain";
import { createDeterministicSolver, createResearchSolver } from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import { createXLayerBlockReader } from "../chain/xlayer";
import { createDatabase } from "../db/client";
import { createRequestRepository } from "../db/requests";
import { readDatabaseUrl, readMarketConfig, readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { captureSnapshot } from "../orchestrator/capture-snapshot";
import { runQuoteMarket } from "../orchestrator/run-market";

let repository: ReturnType<typeof createRequestRepository> | undefined;

export function getRequestRepository() {
  if (repository) return repository;
  repository = createRequestRepository(createDatabase(readDatabaseUrl()).db);
  return repository;
}

export async function openQuoteMarket(policy: StablecoinPolicy) {
  const config = readMarketConfig();
  const requests = getRequestRepository();
  const okx = createOkxClient({ credentials: readOkxCredentials() });
  const solvers = [
    createDeterministicSolver({
      solverId: "deterministic",
      account: privateKeyToAccount(config.DETERMINISTIC_SOLVER_PRIVATE_KEY),
    }),
    createResearchSolver({
      solverId: "research",
      account: privateKeyToAccount(config.AI_SOLVER_PRIVATE_KEY),
      apiKey: config.OPENAI_API_KEY,
      model: config.OPENAI_SOLVER_MODEL,
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
