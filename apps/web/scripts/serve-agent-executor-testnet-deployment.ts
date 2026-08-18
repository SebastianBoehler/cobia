import { createServer } from "node:http";
import { createPublicClient, http } from "viem";
import { buildAgentExecutorDeploymentPlanV1 } from "../lib/deployment/agent-executor-plan";
import { renderTestnetDeploymentConsole } from "../lib/deployment/testnet-deployment-console";
import { executorArtifacts, optionalArgument } from "./executor-deployment-input";

const OPERATOR = "0xB6da8E6d497bd3Bc5016416DA57d177085449124";
const VERIFIER = "0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4";
const CANARY = "0x9Afbf85e52612A9922617aDdA9569e13f565de31";

async function main() {
  const rpcUrl = process.env.XLAYER_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Missing XLAYER_TESTNET_RPC_URL");
  const client = createPublicClient({ transport: http(rpcUrl) });
  const [chainId, nonce, gasPrice, balance] = await Promise.all([
    client.getChainId(),
    client.getTransactionCount({ address: OPERATOR }),
    client.getGasPrice(),
    client.getBalance({ address: OPERATOR }),
  ]);
  if (chainId !== 1952) throw new Error(`Testnet RPC chain mismatch: ${chainId}`);

  const plan = buildAgentExecutorDeploymentPlanV1({
    chainId: 1952,
    deployer: OPERATOR,
    deployerNonce: BigInt(nonce),
    owner: OPERATOR,
    verifier: VERIFIER,
    canaryWallet: CANARY,
    artifacts: executorArtifacts(),
    capabilities: [],
    tokens: [],
  });
  const html = renderTestnetDeploymentConsole({ plan, maxFeePerGas: gasPrice * 2n });
  const port = Number(optionalArgument("port") ?? "4179");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("Invalid --port");
  }

  const server = createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    response.end(html);
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write([
      `Cobia X Layer Testnet deployment console: http://127.0.0.1:${port}`,
      `chain=${chainId} nonce=${nonce} operatorBalanceWei=${balance}`,
      `plan registry=${plan.registry} riskManager=${plan.riskManager} executor=${plan.executor}`,
    ].join("\n") + "\n");
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
