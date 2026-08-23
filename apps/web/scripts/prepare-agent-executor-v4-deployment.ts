import { readFileSync } from "node:fs";
import { getAddress, isAddress, type Address, type Hash, type Hex } from "viem";
import { buildAgentExecutorDeploymentPlanV4 } from "../lib/deployment/agent-executor-v4-plan";
import { addressArgument, argument, executorArtifactsV4 } from "./executor-deployment-input";

interface AdapterFile {
  adapterId: Hash;
  target: Address;
  selector: Hex;
  runtimeCodeHash: Hash;
}
const HASH = /^0x[0-9a-f]{64}$/;
const SELECTOR = /^0x[0-9a-f]{8}$/;

function adapters(path: string): AdapterFile[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(value) || value.length === 0) throw new Error("Adapter input must be a nonempty array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Adapter input is malformed");
    const item = entry as Record<string, unknown>;
    if (typeof item.adapterId !== "string" || !HASH.test(item.adapterId) ||
        typeof item.target !== "string" || !isAddress(item.target) ||
        typeof item.selector !== "string" || !SELECTOR.test(item.selector) ||
        typeof item.runtimeCodeHash !== "string" || !HASH.test(item.runtimeCodeHash)) {
      throw new Error("Adapter input is malformed");
    }
    return { adapterId: item.adapterId as Hash, target: getAddress(item.target),
      selector: item.selector as Hex, runtimeCodeHash: item.runtimeCodeHash as Hash };
  });
}

const chainId = Number(argument("chain-id"));
if (chainId !== 1 && chainId !== 196) throw new Error("--chain-id must be 1 or 196");
const plan = buildAgentExecutorDeploymentPlanV4({
  chainId,
  deployer: addressArgument("deployer"),
  deployerNonce: BigInt(argument("nonce")),
  owner: addressArgument("owner"),
  verifier: addressArgument("verifier"),
  canaryWallet: addressArgument("canary-wallet"),
  registry: addressArgument("registry"),
  artifacts: executorArtifactsV4(),
  adapters: adapters(argument("adapters")),
});
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
