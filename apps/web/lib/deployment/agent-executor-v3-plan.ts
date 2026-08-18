import {
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  parseAbi,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";

const REGISTRY_ABI = parseAbi([
  "function activate(bytes32 key)",
  "function setPaused(bool nextPaused)",
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
interface TokenLimits {
  token: Address;
  maxRoute: bigint;
  maxWalletDaily: bigint;
  maxCumulative: bigint;
}
interface PlanCall { label: string; to: Address; data: Hex; value: "0x0" }

function call(
  label: string,
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): PlanCall {
  return { label, to, data: encodeFunctionData({ abi, functionName, args } as never), value: "0x0" };
}

function limits(input: TokenLimits) {
  if (input.maxRoute <= 0n || input.maxRoute > input.maxWalletDaily ||
    input.maxWalletDaily > input.maxCumulative || input.maxCumulative > (1n << 128n) - 1n) {
    throw new Error("V3 deployment token limits are invalid");
  }
  return {
    maxRoute: input.maxRoute,
    maxWalletDaily: input.maxWalletDaily,
    maxCumulative: input.maxCumulative,
  };
}

/** Builds unsigned X Layer mainnet deployment and Safe calls; it has no sender or signer. */
export function buildAgentExecutorDeploymentPlanV3(input: {
  deployer: Address;
  deployerNonce: bigint;
  owner: Address;
  verifier: Address;
  canaryWallet: Address;
  registry: Address;
  artifacts: { riskManager: Artifact; executor: Artifact };
  capabilityPermissionKeys: readonly Hash[];
  tokens: readonly TokenLimits[];
}) {
  if (input.deployerNonce < 0n || input.capabilityPermissionKeys.length === 0 || input.tokens.length === 0) {
    throw new Error("V3 production deployment plan is incomplete");
  }
  if (new Set(input.capabilityPermissionKeys.map((key) => key.toLowerCase())).size !==
    input.capabilityPermissionKeys.length ||
    new Set(input.tokens.map(({ token }) => token.toLowerCase())).size !== input.tokens.length) {
    throw new Error("V3 production activation values must be unique");
  }
  const deployer = getAddress(input.deployer);
  const owner = getAddress(input.owner);
  const verifier = getAddress(input.verifier);
  const canaryWallet = getAddress(input.canaryWallet);
  const registry = getAddress(input.registry);
  const riskManager = getContractAddress({ from: deployer, nonce: input.deployerNonce });
  const executor = getContractAddress({ from: deployer, nonce: input.deployerNonce + 1n });
  const deployments = [{
    label: "deploy-risk-manager",
    nonce: input.deployerNonce.toString(),
    expectedContract: riskManager,
    data: encodeDeployData({
      abi: input.artifacts.riskManager.abi,
      bytecode: input.artifacts.riskManager.bytecode,
      args: [owner, executor, verifier],
    }),
    value: "0x0" as const,
  }, {
    label: "deploy-executor-v3",
    nonce: (input.deployerNonce + 1n).toString(),
    expectedContract: executor,
    data: encodeDeployData({
      abi: input.artifacts.executor.abi,
      bytecode: input.artifacts.executor.bytecode,
      args: [registry, riskManager],
    }),
    value: "0x0" as const,
  }];
  const proposalTransactions: PlanCall[] = [
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
    ...input.capabilityPermissionKeys.map((key, index) =>
      call(`activate-capability-${index}`, registry, REGISTRY_ABI, "activate", [key])),
    ...input.tokens.map((token, index) =>
      call(`activate-token-${index}`, riskManager, RISK_ABI, "activateToken", [getAddress(token.token)])),
    call("activate-canary-wallet", riskManager, RISK_ABI, "activateWallet", [canaryWallet]),
    call("activate-unpause", riskManager, RISK_ABI, "activateUnpause"),
    call("unpause-registry", registry, REGISTRY_ABI, "setPaused", [false]),
  ];
  return {
    version: 3 as const,
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
