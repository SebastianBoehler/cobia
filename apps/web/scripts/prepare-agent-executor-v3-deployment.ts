import { PROTOCOL_REGISTRY } from "../lib/adapters/registry";
import { buildAgentExecutorDeploymentPlanV3 } from "../lib/deployment/agent-executor-v3-plan";
import { productionCapabilityPermissionKeys } from "../lib/deployment/production-capability-permissions";
import { buildSafeBatch } from "../lib/deployment/safe-batch";
import {
  addressArgument,
  argument,
  executorArtifactsV3,
  optionalArgument,
} from "./executor-deployment-input";

const registry = PROTOCOL_REGISTRY;
const plan = buildAgentExecutorDeploymentPlanV3({
  deployer: addressArgument("deployer"),
  deployerNonce: BigInt(argument("nonce")),
  owner: addressArgument("owner"),
  verifier: addressArgument("verifier"),
  canaryWallet: addressArgument("canary-wallet"),
  registry: addressArgument("registry"),
  artifacts: executorArtifactsV3(),
  capabilityPermissionKeys: productionCapabilityPermissionKeys(),
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
      chainId: 196,
      safe: plan.owner,
      name: "Cobia Executor V3 proposals",
      description: "Starts the 48-hour V3 token, canary wallet, and unpause delays.",
      createdAt,
      transactions: plan.proposalTransactions,
    }),
    activation: buildSafeBatch({
      chainId: 196,
      safe: plan.owner,
      name: "Cobia Executor V3 activation",
      description: "Activates matured registry permissions and V3 risk bounds, then unpauses mainnet execution.",
      createdAt,
      transactions: plan.activationTransactions,
    }),
  }, null, 2)}\n`);
} else {
  throw new Error(`Unsupported --format ${format}`);
}
