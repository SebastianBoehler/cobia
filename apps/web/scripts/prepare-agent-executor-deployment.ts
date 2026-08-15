import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, toFunctionSelector, type Abi, type Hex } from "viem";
import { PROTOCOL_REGISTRY } from "../lib/adapters/registry";
import { buildAgentExecutorDeploymentPlanV1 } from "../lib/deployment/agent-executor-plan";
import { buildSafeBatch } from "../lib/deployment/safe-batch";

interface ArtifactFile { abi: Abi; bytecode: { object: Hex } }

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function address(name: string) {
  const value = argument(name);
  if (!isAddress(value)) throw new Error(`Invalid --${name}`);
  return getAddress(value);
}

function artifact(name: string) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const value = JSON.parse(readFileSync(
    `${root}contracts/out/${name}.sol/${name}.json`,
    "utf8",
  )) as ArtifactFile;
  if (!value.bytecode.object.startsWith("0x") || value.bytecode.object.length < 4) {
    throw new Error(`${name} artifact is unavailable; run pnpm contracts:test first`);
  }
  return { abi: value.abi, bytecode: value.bytecode.object };
}

const registry = PROTOCOL_REGISTRY;
const plan = buildAgentExecutorDeploymentPlanV1({
  deployer: address("deployer"),
  deployerNonce: BigInt(argument("nonce")),
  owner: address("owner"),
  verifier: address("verifier"),
  canaryWallet: address("canary-wallet"),
  artifacts: {
    registry: artifact("CobiaAdapterRegistry"),
    riskManager: artifact("CobiaRiskManagerV1"),
    executor: artifact("CobiaExecutorV2"),
  },
  capabilities: [{
    id: "aave-v3.supply",
    version: 1,
    target: registry.aaveV3.pool.address,
    selector: toFunctionSelector("supply(address,uint256,address,uint16)"),
    runtimeCodeHash: registry.aaveV3.pool.runtimeCodeHash,
  }, {
    id: "curve-stableswap-ng.exact-input",
    version: 1,
    target: registry.curveStableSwapNg.pair.pool.address,
    selector: toFunctionSelector("exchange(int128,int128,uint256,uint256,address)"),
    runtimeCodeHash: registry.curveStableSwapNg.pair.pool.runtimeCodeHash,
  }, {
    id: "uniswap-v3.exact-input",
    version: 1,
    target: registry.uniswapV3.swapRouter02.address,
    selector: toFunctionSelector(
      "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
    ),
    runtimeCodeHash: registry.uniswapV3.swapRouter02.runtimeCodeHash,
  }],
  tokens: Object.values(registry.aaveV3.assets).map(({ underlying }) => ({
    token: underlying.address,
    maxRoute: 10_000_000n,
    maxWalletDaily: 50_000_000n,
    maxCumulative: 1_000_000_000n,
  })),
});

const format = optionalArgument("format") ?? "plan";
if (format === "plan") {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (format === "safe-batches") {
  const createdAt = Number(argument("created-at"));
  process.stdout.write(`${JSON.stringify({
    proposals: buildSafeBatch({
      safe: plan.owner,
      name: "Cobia Executor V2 proposals",
      description: "Pauses the registry and starts the 48-hour capability, token, canary, and unpause delays.",
      createdAt,
      transactions: plan.proposalTransactions,
    }),
    activation: buildSafeBatch({
      safe: plan.owner,
      name: "Cobia Executor V2 activation",
      description: "Activates the exact delayed proposals and unpauses the registry after independent re-verification.",
      createdAt,
      transactions: plan.activationTransactions,
    }),
  }, null, 2)}\n`);
} else {
  throw new Error(`Unsupported --format ${format}`);
}
