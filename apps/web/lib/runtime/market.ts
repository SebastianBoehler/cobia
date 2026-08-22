import {
  OpenIntentPolicyV3Schema,
  TransactionProgramV1Schema,
  type GeneralIntentPolicyV2,
  type OpenIntentPolicyV3,
} from "@cobia/domain";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { createDatabase } from "../db/client";
import { createActivityRepository } from "../db/activity";
import { createIntentRepository } from "../db/intents";
import { createNetworkOutcomeRepository } from "../db/network-outcomes";
import { createChallengeRepository } from "../db/challenges";
import { createCommerceOfferRepository } from "../db/commerce-offers";
import { createCommercePlacementRepository } from "../db/commerce-placements";
import { createSolverProfileRepository } from "../db/solver-profiles";
import { createSolverRunRepository } from "../db/solver-runs";
import { createSolverSubmissionRepository } from "../db/solver-submissions";
import { createOpenIntentSnapshotRepository } from "../db/open-intent-snapshots";
import { createSolverDecisionClaimRepository } from "../db/solver-decision-claims";
import { createSolverSuccessFeeRepository } from "../db/solver-success-fees";
import { createWalletAuthRepository } from "../db/wallet-auth";
import { readCodingAgentV3RuntimeConfig, readDatabaseUrl, readOkxCredentials } from "../env";
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
import { verifyRuntimeCompositionProposal } from "./composition-verification";
import { verifyOpenStagedProposalV1 } from "../open-exchange/transaction-verifier";
import {
  assertAgentExecutorReadyV1, createAgentExecutorReadV1,
} from "../coding-agent-sandbox/executor-preflight";
import { replayCapabilityRemotely, replayTransactionRemotely } from "../replay/remote-client";
import { createOkxClient } from "../okx/client";
import { publishCapabilityComposition } from "./composition-market";
import { IntentSnapshotUnavailableError, OwnerBalanceRequiredError } from "./market-errors";

let activityRepository: ReturnType<typeof createActivityRepository> | undefined;
let database: ReturnType<typeof createDatabase> | undefined;
let intentRepository: ReturnType<typeof createIntentRepository> | undefined;
let networkOutcomeRepository: ReturnType<typeof createNetworkOutcomeRepository> | undefined;
let challengeRepository: ReturnType<typeof createChallengeRepository> | undefined;
let commerceOfferRepository: ReturnType<typeof createCommerceOfferRepository> | undefined;
let commercePlacementRepository: ReturnType<typeof createCommercePlacementRepository> | undefined;
let solverProfileRepository: ReturnType<typeof createSolverProfileRepository> | undefined;
let solverRunRepository: ReturnType<typeof createSolverRunRepository> | undefined;
let solverSubmissionRepository: ReturnType<typeof createSolverSubmissionRepository> | undefined;
let openIntentSnapshotRepository: ReturnType<typeof createOpenIntentSnapshotRepository> | undefined;
let solverDecisionClaimRepository: ReturnType<typeof createSolverDecisionClaimRepository> | undefined;
let solverSuccessFeeRepository: ReturnType<typeof createSolverSuccessFeeRepository> | undefined;
let walletAuthRepository: ReturnType<typeof createWalletAuthRepository> | undefined;

export { IntentSnapshotUnavailableError, OwnerBalanceRequiredError };

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

export function getNetworkOutcomeRepository() {
  networkOutcomeRepository ??= createNetworkOutcomeRepository(getDatabase());
  return networkOutcomeRepository;
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

export function getWalletAuthRepository() {
  walletAuthRepository ??= createWalletAuthRepository(getDatabase());
  return walletAuthRepository;
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

type ExecutionChainId = 1 | 196 | 8453;

function openIntentClients() {
  const config = readMarketConfig();
  const xLayerClient = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
    cacheTime: 0,
  });
  return {
    1: createPublicClient({ chain: mainnet,
      transport: http(config.ETHEREUM_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
    196: xLayerClient,
    8453: createPublicClient({ chain: base,
      transport: http(config.BASE_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
  };
}

async function missingOwnerNativeBalanceChainsWithClients(input: {
  owner: Address;
  executionChainIds: readonly ExecutionChainId[];
}, clients: ReturnType<typeof openIntentClients>): Promise<ExecutionChainId[]> {
  const balances = await Promise.all(input.executionChainIds.map(async (chainId) => ({
    chainId,
    balance: await clients[chainId].getBalance({ address: input.owner }),
  })));
  return balances.flatMap(({ chainId, balance }) => balance === 0n ? [chainId] : []);
}

export function missingOwnerNativeBalanceChains(input: {
  owner: Address;
  executionChainIds: readonly ExecutionChainId[];
}): Promise<ExecutionChainId[]> {
  return missingOwnerNativeBalanceChainsWithClients(input, openIntentClients());
}

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
  const clients = openIntentClients();
  const missingChains = await missingOwnerNativeBalanceChainsWithClients({
    owner: input.policy.owner as Address,
    executionChainIds: input.policy.executionChainIds,
  }, clients);
  if (missingChains.length > 0) throw new OwnerBalanceRequiredError();
  const snapshot = await captureOpenIntentSnapshotV1(input.policy, {
    ...clients,
  }, createOkxClient({ credentials: readOkxCredentials() })).catch(() => {
    throw new IntentSnapshotUnavailableError();
  });
  const intent = await getIntentRepository().create(input);
  await getOpenIntentSnapshotRepository().create(snapshot);
  return { intent, snapshot };
}

export async function publishCapabilityCompositionIntent(input: {
  policy: import("@cobia/domain").CapabilityCompositionPolicyV1;
  ownerSignature: `0x${string}`;
}) {
  return publishCapabilityComposition(input, {
    intents: getIntentRepository(), snapshots: getOpenIntentSnapshotRepository(),
  });
}

export function submitOpenSolverDecision(value: {
  claim: unknown; signature: string; decision: unknown;
}) {
  const config = readCodingAgentV3RuntimeConfig();
  const client = createPublicClient({ chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0 });
  const ethereumClient = createPublicClient({ chain: mainnet,
    transport: http(config.ETHEREUM_RPC_URL, { timeout: 15_000 }), cacheTime: 0 });
  const baseClient = createPublicClient({ chain: base,
    transport: http(config.BASE_RPC_URL, { timeout: 15_000 }), cacheTime: 0 });
  const verificationClient = (read: {
    getBlock(input: { blockNumber: bigint }): Promise<{ hash: `0x${string}` | null }>;
    getCode(input: { address: Address; blockNumber: bigint }): Promise<`0x${string}` | undefined>;
    readAllowance(input: { token: Address; owner: Address; spender: Address; blockNumber: bigint }):
      Promise<bigint>;
  }) => read;
  const clients = {
    1: verificationClient({
      getBlock: ({ blockNumber }) => ethereumClient.getBlock({ blockNumber }),
      getCode: ({ address, blockNumber }) => ethereumClient.getCode({ address, blockNumber }),
      readAllowance: ({ token, owner, spender, blockNumber }) => ethereumClient.readContract({
        address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender], blockNumber,
      }),
    }),
    196: verificationClient({
      getBlock: ({ blockNumber }) => client.getBlock({ blockNumber }),
      getCode: ({ address, blockNumber }) => client.getCode({ address, blockNumber }),
      readAllowance: ({ token, owner, spender, blockNumber }) => client.readContract({
        address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender], blockNumber,
      }),
    }),
    8453: verificationClient({
      getBlock: ({ blockNumber }) => baseClient.getBlock({ blockNumber }),
      getCode: ({ address, blockNumber }) => baseClient.getCode({ address, blockNumber }),
      readAllowance: ({ token, owner, spender, blockNumber }) => baseClient.readContract({
        address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender], blockNumber,
      }),
    }),
  } as const;
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
      if (input.policy && typeof input.policy === "object" && "kind" in input.policy &&
          input.policy.kind === "capability-composition") {
        if (input.proposalKind !== "capability-v2") {
          return { accepted: false as const, errorCodes: ["POLICY_MISMATCH"] };
        }
        return verifyRuntimeCompositionProposal(input, { client, config, verifier });
      }
      if (input.proposalKind === "transaction-program") {
        return verifyOpenStagedProposalV1({ ...input,
          providerArtifacts: input.providerArtifacts }, {
          clients,
          async replay(replayInput) {
            const snapshot = replayInput.snapshot as { anchors?: { chainId: number; blockNumber: string }[] };
            const program = TransactionProgramV1Schema.parse(replayInput.program);
            const walletChains = [...new Set(program.stages.filter(({ kind }) => kind === "wallet-transaction")
              .map(({ chainId }) => chainId))];
            if (walletChains.length !== 1) throw new Error("A replay run must use one wallet execution chain");
            const chainId = walletChains[0]!;
            const anchor = snapshot.anchors?.find((item) => item.chainId === chainId);
            if (!anchor) throw new Error(`Chain ${chainId} replay anchor is unavailable`);
            return replayTransactionRemotely({
              ...replayInput,
              chainId,
              blockNumber: anchor.blockNumber,
            });
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
          return replayCapabilityRemotely({
            blockNumber: replayInput.blockNumber,
            program: replayInput.program,
            compiled: replayInput.compiled,
          });
        },
        signTypedData: (typedData) => verifier.signTypedData(typedData),
      });
    },
  });
  return intake.submit(value);
}
