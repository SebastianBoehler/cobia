import {
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";

const REGISTRY_ABI = parseAbi([
  "function setPaused(bool nextPaused)",
  "function propose(bytes32 adapterId,address target,bytes4 selector,bytes32 runtimeCodeHash) returns (bytes32 key)",
  "function activate(bytes32 key)",
]);
const RISK_ABI = parseAbi([
  "function proposeToken(address token,(uint128 maxRoute,uint128 maxWalletDaily,uint128 maxCumulative) limits)",
  "function activateToken(address token)",
  "function proposeWallet(address wallet)",
  "function activateWallet(address wallet)",
  "function proposeUnpause()",
  "function activateUnpause()",
]);

interface Artifact { abi: Abi; bytecode: Hex }
interface Capability {
  id: string;
  version: number;
  target: Address;
  selector: Hex;
  runtimeCodeHash: Hash;
}
interface TokenLimits {
  token: Address;
  maxRoute: bigint;
  maxWalletDaily: bigint;
  maxCumulative: bigint;
}
interface PlanCall { label: string; to: Address; data: Hex; value: "0x0" }

function capabilityKey(capability: Capability): Hash {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(capability.id) ||
    !Number.isSafeInteger(capability.version) || capability.version < 1 ||
    !/^0x[0-9a-fA-F]{8}$/.test(capability.selector)) {
    throw new Error("Deployment capability identity is invalid");
  }
  return keccak256(toBytes(`${capability.id}@${capability.version}`));
}

function permissionKey(capability: Capability): Hash {
  return keccak256(encodeAbiParameters(
    parseAbiParameters("bytes32,address,bytes4"),
    [capabilityKey(capability), getAddress(capability.target), capability.selector],
  ));
}

function call(label: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): PlanCall {
  return {
    label,
    to,
    data: encodeFunctionData({ abi, functionName, args } as never),
    value: "0x0",
  };
}

function limits(input: TokenLimits) {
  if (input.maxRoute <= 0n || input.maxRoute > input.maxWalletDaily ||
    input.maxWalletDaily > input.maxCumulative || input.maxCumulative > (1n << 128n) - 1n) {
    throw new Error("Deployment token limits are invalid");
  }
  return {
    maxRoute: input.maxRoute,
    maxWalletDaily: input.maxWalletDaily,
    maxCumulative: input.maxCumulative,
  };
}

/** Builds unsigned chain-196 calls only. It has no signer or broadcast method. */
export function buildAgentExecutorDeploymentPlanV1(input: {
  deployer: Address;
  deployerNonce: bigint;
  owner: Address;
  verifier: Address;
  canaryWallet: Address;
  artifacts: { registry: Artifact; riskManager: Artifact; executor: Artifact };
  capabilities: readonly Capability[];
  tokens: readonly TokenLimits[];
}) {
  if (input.deployerNonce < 0n || input.capabilities.length === 0 || input.tokens.length === 0) {
    throw new Error("Deployment plan is incomplete");
  }
  const deployer = getAddress(input.deployer);
  const owner = getAddress(input.owner);
  const verifier = getAddress(input.verifier);
  const canaryWallet = getAddress(input.canaryWallet);
  const registry = getContractAddress({ from: deployer, nonce: input.deployerNonce });
  const riskManager = getContractAddress({ from: deployer, nonce: input.deployerNonce + 1n });
  const executor = getContractAddress({ from: deployer, nonce: input.deployerNonce + 2n });
  const deployments = [{
    label: "deploy-registry",
    nonce: input.deployerNonce.toString(),
    expectedContract: registry,
    data: encodeDeployData({
      abi: input.artifacts.registry.abi,
      bytecode: input.artifacts.registry.bytecode,
      args: [owner],
    }),
    value: "0x0" as const,
  }, {
    label: "deploy-risk-manager",
    nonce: (input.deployerNonce + 1n).toString(),
    expectedContract: riskManager,
    data: encodeDeployData({
      abi: input.artifacts.riskManager.abi,
      bytecode: input.artifacts.riskManager.bytecode,
      args: [owner, executor, verifier],
    }),
    value: "0x0" as const,
  }, {
    label: "deploy-executor",
    nonce: (input.deployerNonce + 2n).toString(),
    expectedContract: executor,
    data: encodeDeployData({
      abi: input.artifacts.executor.abi,
      bytecode: input.artifacts.executor.bytecode,
      args: [registry, riskManager],
    }),
    value: "0x0" as const,
  }];
  const proposalTransactions: PlanCall[] = [
    call("pause-registry", registry, REGISTRY_ABI, "setPaused", [true]),
    ...input.capabilities.map((capability) => call(
      `propose-${capability.id}@${capability.version}`,
      registry,
      REGISTRY_ABI,
      "propose",
      [capabilityKey(capability), getAddress(capability.target), capability.selector, capability.runtimeCodeHash],
    )),
    ...input.tokens.map((token, index) => call(
      `propose-token-${index}`,
      riskManager,
      RISK_ABI,
      "proposeToken",
      [getAddress(token.token), limits(token)],
    )),
    call("propose-canary-wallet", riskManager, RISK_ABI, "proposeWallet", [canaryWallet]),
    call("propose-unpause", riskManager, RISK_ABI, "proposeUnpause"),
  ];
  const activationTransactions: PlanCall[] = [
    ...input.capabilities.map((capability) => call(
      `activate-${capability.id}@${capability.version}`,
      registry,
      REGISTRY_ABI,
      "activate",
      [permissionKey(capability)],
    )),
    ...input.tokens.map((token, index) => call(
      `activate-token-${index}`,
      riskManager,
      RISK_ABI,
      "activateToken",
      [getAddress(token.token)],
    )),
    call("activate-canary-wallet", riskManager, RISK_ABI, "activateWallet", [canaryWallet]),
    call("activate-unpause", riskManager, RISK_ABI, "activateUnpause"),
    call("unpause-registry", registry, REGISTRY_ABI, "setPaused", [false]),
  ];
  return {
    version: 1 as const,
    chainId: 196 as const,
    deployer,
    owner,
    verifier,
    canaryWallet,
    registry,
    riskManager,
    executor,
    deploymentInputs: { riskManagerExecutor: executor },
    deployments,
    proposalTransactions,
    activationDelaySeconds: 48 * 60 * 60,
    activationTransactions,
  };
}
