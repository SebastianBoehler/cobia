import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import {
  renderMainnetDeploymentConsole,
  type MainnetDeploymentConsolePlan,
} from "../lib/deployment/mainnet-v3-deployment-console";
import { optionalArgument } from "./executor-deployment-input";

const PLAN_SHA256 = "13482d50b1ce5cead9268d6a0135c5855be40408d83894553d8d420b0c59e350";
const OPERATOR = getAddress("0xB6da8E6d497bd3Bc5016416DA57d177085449124");
const SAFE = getAddress("0x08eea990F0b165A20d723e59517044a519C83351");
const REGISTRY = getAddress("0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877");
const VERIFIER = getAddress("0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4");
const RISK_MANAGER = getAddress("0xE399a72B7d0fEF974e868582671D4c7a23d37637");
const EXECUTOR = getAddress("0xa3370D2719e670B46682bcC8f7Fae2f36797b66D");

function deployment(value: unknown, label: string, nonce: string, expectedContract: Address) {
  if (!value || typeof value !== "object") throw new Error(`Malformed ${label} deployment`);
  const item = value as Record<string, unknown>;
  if (item.label !== label || item.nonce !== nonce || item.value !== "0x0" ||
      item.expectedContract !== expectedContract || typeof item.data !== "string" ||
      !/^0x[0-9a-f]+$/.test(item.data)) {
    throw new Error(`Reviewed ${label} deployment does not match`);
  }
  return { label, nonce, expectedContract, value: "0x0" as const, data: item.data as Hex };
}

function reviewedPlan(): MainnetDeploymentConsolePlan {
  const path = fileURLToPath(new URL("../../../docs/deployments/general-asset-v4-xlayer-unsigned-plan.json",
    import.meta.url));
  const source = readFileSync(path);
  if (createHash("sha256").update(source).digest("hex") !== PLAN_SHA256) {
    throw new Error("Reviewed V4 plan SHA-256 mismatch");
  }
  const value = JSON.parse(source.toString("utf8")) as Record<string, unknown>;
  if (value.version !== 4 || value.chainId !== 196 || value.deployer !== OPERATOR ||
      value.owner !== SAFE || value.registry !== REGISTRY || value.verifier !== VERIFIER ||
      value.riskManager !== RISK_MANAGER || value.executor !== EXECUTOR ||
      !Array.isArray(value.deployments) || value.deployments.length !== 2) {
    throw new Error("Reviewed V4 plan identity mismatch");
  }
  return { version: 4, chainId: 196, deployer: OPERATOR, owner: SAFE, registry: REGISTRY,
    verifier: VERIFIER, deployments: [
      deployment(value.deployments[0], "deploy-risk-manager-v2", "13", RISK_MANAGER),
      deployment(value.deployments[1], "deploy-executor-v4", "14", EXECUTOR),
    ] };
}

async function main() {
  const plan = reviewedPlan();
  const rpcUrl = process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech";
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000 }) });
  const [chainId, block, nonce, gasPrice, balance, registryCode, riskCode, executorCode] =
    await Promise.all([
      client.getChainId(), client.getBlock({ blockTag: "latest" }),
      client.getTransactionCount({ address: OPERATOR }), client.getGasPrice(),
      client.getBalance({ address: OPERATOR }), client.getCode({ address: REGISTRY }),
      client.getCode({ address: RISK_MANAGER }), client.getCode({ address: EXECUTOR }),
    ]);
  if (chainId !== 196) throw new Error(`Mainnet RPC chain mismatch: ${chainId}`);
  if (nonce !== 13) throw new Error(`Operator nonce changed: expected 13, got ${nonce}`);
  if (balance === 0n) throw new Error("Operator has no deployment gas");
  if (!registryCode || registryCode === "0x") throw new Error("Committed registry has no code");
  if ((riskCode && riskCode !== "0x") || (executorCode && executorCode !== "0x")) {
    throw new Error("A predicted V4 contract address already has code; reconcile before signing");
  }
  const html = renderMainnetDeploymentConsole({ plan, maxFeePerGas: gasPrice * 2n });
  const port = Number(optionalArgument("port") ?? "4179");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error("Invalid --port");
  const server = createServer((request, response) => {
    if (request.url !== "/") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer" });
    response.end(html);
  });
  server.listen(port, "127.0.0.1", () => process.stdout.write([
    `Cobia V4 mainnet deployment console: http://127.0.0.1:${port}`,
    `block=${block.number} chain=${chainId} nonce=${nonce} operatorBalanceWei=${balance}`,
    `registry=${REGISTRY} riskManager=${RISK_MANAGER} executorV4=${EXECUTOR}`,
  ].join("\n") + "\n"));
}

void main();
