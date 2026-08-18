import { buildAgentExecutorDeploymentPlanV1 } from "../lib/deployment/agent-executor-plan";
import {
  addressArgument,
  argument,
  executorArtifacts,
} from "./executor-deployment-input";

const deployer = addressArgument("deployer");
const owner = addressArgument("owner");
if (deployer !== owner) {
  throw new Error("Testnet deployer must be the temporary owner");
}

const plan = buildAgentExecutorDeploymentPlanV1({
  chainId: 1952,
  deployer,
  deployerNonce: BigInt(argument("nonce")),
  owner,
  verifier: addressArgument("verifier"),
  canaryWallet: addressArgument("canary-wallet"),
  artifacts: executorArtifacts(),
  capabilities: [],
  tokens: [],
});

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
