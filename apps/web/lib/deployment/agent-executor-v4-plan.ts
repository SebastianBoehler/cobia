import {
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  keccak256,
  parseAbi,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  assertPartitionedMigrationBudgetV4,
  type PartitionedMigrationBudgetInputV4,
} from "./v4-migration-budget";

const REGISTRY_ABI = parseAbi([
  "function propose(bytes32 adapterId,address target,bytes4 selector,bytes32 runtimeCodeHash) returns (bytes32)",
  "function activate(bytes32 key)",
]);
const RISK_ABI = parseAbi([
  "function proposeWallet(address wallet)",
  "function activateWallet(address wallet)",
  "function proposeUnpause()",
  "function activateUnpause()",
  "function proposeOpenAccess()",
  "function activateOpenAccess()",
  "function reduceLimits((uint128 maxRouteUsdE8,uint128 maxWallet24hUsdE8,uint128 maxProtocol24hUsdE8) reduced)",
]);

interface Artifact { abi: Abi; bytecode: Hex }
interface AdapterPermission {
  adapterId: Hash;
  target: Address;
  selector: Hex;
  runtimeCodeHash: Hash;
}
interface PlanCall { label: string; to: Address; data: Hex; value: "0x0" }

function call(label: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): PlanCall {
  return { label, to, data: encodeFunctionData({ abi, functionName, args } as never), value: "0x0" };
}

function permissionKey(adapter: AdapterPermission): Hash {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "address" }, { type: "bytes4" },
  ], [adapter.adapterId, getAddress(adapter.target), adapter.selector]));
}

/** Builds unsigned Ethereum or X Layer deployment/canary/open calls; it never creates a signer. */
export function buildAgentExecutorDeploymentPlanV4(input: {
  chainId: 1 | 196;
  deployer: Address;
  deployerNonce: bigint;
  owner: Address;
  verifier: Address;
  canaryWallet: Address;
  registry: Address;
  artifacts: { riskManager: Artifact; executor: Artifact };
  adapters: readonly AdapterPermission[];
  migration: PartitionedMigrationBudgetInputV4;
  changeDelaySeconds?: number;
  retainProtocolCap?: boolean;
}) {
  if (input.deployerNonce < 0n) {
    throw new Error("V4 deployment plan is incomplete");
  }
  const identities = input.adapters.map((adapter) =>
    `${adapter.adapterId.toLowerCase()}:${adapter.target.toLowerCase()}:${adapter.selector.toLowerCase()}`);
  if (new Set(identities).size !== identities.length) {
    throw new Error("V4 adapter permissions must be unique");
  }
  const deployer = getAddress(input.deployer);
  const owner = getAddress(input.owner);
  const verifier = getAddress(input.verifier);
  const canaryWallet = getAddress(input.canaryWallet);
  const registry = getAddress(input.registry);
  if (input.migration.chainId !== input.chainId) throw new Error("V4 migration chain mismatch");
  const migration = assertPartitionedMigrationBudgetV4(input.migration);
  const protocolCapUsdE8 = input.retainProtocolCap
    ? "5000000000000" : migration.v4ProtocolCapUsdE8;
  const changeDelaySeconds = input.changeDelaySeconds ?? 48 * 60 * 60;
  if (!Number.isSafeInteger(changeDelaySeconds) || changeDelaySeconds < 0 ||
      changeDelaySeconds > 7 * 24 * 60 * 60) {
    throw new Error("V4 change delay must be between zero and seven days");
  }
  if (BigInt(migration.v4ProtocolCapUsdE8) < 500_000_000_000n) {
    throw new Error("V4 migration protocol cap cannot be lower than the wallet cap");
  }
  const riskManager = getContractAddress({ from: deployer, nonce: input.deployerNonce });
  const executor = getContractAddress({ from: deployer, nonce: input.deployerNonce + 1n });
  const adapters = input.adapters.map((adapter) => ({ ...adapter,
    target: getAddress(adapter.target), key: permissionKey(adapter) }));
  const proposalTransactions = [
    ...adapters.map((adapter, index) => call(`propose-adapter-${index}`, registry, REGISTRY_ABI,
      "propose", [adapter.adapterId, adapter.target, adapter.selector, adapter.runtimeCodeHash])),
    call("propose-canary-wallet", riskManager, RISK_ABI, "proposeWallet", [canaryWallet]),
    call("propose-unpause", riskManager, RISK_ABI, "proposeUnpause"),
  ];
  const activationTransactions = [
    ...adapters.map((adapter, index) => call(`activate-adapter-${index}`, registry, REGISTRY_ABI,
      "activate", [adapter.key])),
    call("activate-canary-wallet", riskManager, RISK_ABI, "activateWallet", [canaryWallet]),
    call("activate-unpause", riskManager, RISK_ABI, "activateUnpause"),
  ];
  const openProposalTransaction = call(
    "propose-open-access", riskManager, RISK_ABI, "proposeOpenAccess",
  );
  const openActivationTransaction = call(
    "activate-open-access", riskManager, RISK_ABI, "activateOpenAccess",
  );
  return {
    version: 4 as const,
    chainId: input.chainId,
    deployer, owner, verifier, canaryWallet, registry, riskManager, executor,
    limitsUsdE8: { route: "100000000000", wallet24h: "500000000000",
      protocol24h: protocolCapUsdE8 },
    retainProtocolCap: input.retainProtocolCap === true,
    migration,
    deployments: [{ label: "deploy-risk-manager-v2", nonce: input.deployerNonce.toString(),
      expectedContract: riskManager, value: "0x0" as const,
      data: encodeDeployData({ abi: input.artifacts.riskManager.abi,
        bytecode: input.artifacts.riskManager.bytecode,
        args: [owner, executor, verifier, changeDelaySeconds] }) },
    { label: "deploy-executor-v4", nonce: (input.deployerNonce + 1n).toString(),
      expectedContract: executor, value: "0x0" as const,
      data: encodeDeployData({ abi: input.artifacts.executor.abi,
        bytecode: input.artifacts.executor.bytecode, args: [registry, riskManager] }) }],
    adapters,
    migrationRiskReductionTransactions: input.retainProtocolCap ? [] : [
      call("reduce-v4-migration-cap", riskManager, RISK_ABI, "reduceLimits",
        [[100_000_000_000n, 500_000_000_000n, BigInt(migration.v4ProtocolCapUsdE8)]])],
    proposalTransactions,
    activationDelaySeconds: changeDelaySeconds,
    activationTransactions,
    canaryLaunchTransactions: changeDelaySeconds === 0
      ? [...proposalTransactions, ...activationTransactions] : proposalTransactions,
    openProposalTransaction,
    openActivationTransaction,
    publicLaunchTransactions: changeDelaySeconds === 0
      ? [openProposalTransaction, openActivationTransaction] : [openProposalTransaction],
  };
}

export function safeProposalTransactionsV4(
  plan: ReturnType<typeof buildAgentExecutorDeploymentPlanV4>,
  options: { retainProtocolCap: boolean },
) {
  return options.retainProtocolCap
    ? [...plan.canaryLaunchTransactions]
    : [...plan.migrationRiskReductionTransactions, ...plan.canaryLaunchTransactions];
}
