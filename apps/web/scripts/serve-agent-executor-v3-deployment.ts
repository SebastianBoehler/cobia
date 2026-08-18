import { createServer } from "node:http";
import { createPublicClient, http } from "viem";
import { PROTOCOL_REGISTRY } from "../lib/adapters/registry";
import { buildAgentExecutorDeploymentPlanV3 } from "../lib/deployment/agent-executor-v3-plan";
import { renderMainnetV3DeploymentConsole } from "../lib/deployment/mainnet-v3-deployment-console";
import { productionCapabilityPermissionKeys } from "../lib/deployment/production-capability-permissions";
import { executorArtifactsV3, optionalArgument } from "./executor-deployment-input";

const OPERATOR = "0xB6da8E6d497bd3Bc5016416DA57d177085449124";
const SAFE = "0x08eea990F0b165A20d723e59517044a519C83351";
const VERIFIER = "0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4";
const CANARY = "0x9Afbf85e52612A9922617aDdA9569e13f565de31";
const REGISTRY = "0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877";

async function main() {
  const rpcUrl = process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech";
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000 }) });
  const [chainId, nonce, gasPrice, balance, registryCode] = await Promise.all([
    client.getChainId(),
    client.getTransactionCount({ address: OPERATOR }),
    client.getGasPrice(),
    client.getBalance({ address: OPERATOR }),
    client.getCode({ address: REGISTRY }),
  ]);
  if (chainId !== 196) throw new Error(`Mainnet RPC chain mismatch: ${chainId}`);
  if (!registryCode || registryCode === "0x") throw new Error("Committed mainnet registry has no code");
  const plan = buildAgentExecutorDeploymentPlanV3({
    deployer: OPERATOR,
    deployerNonce: BigInt(nonce),
    owner: SAFE,
    verifier: VERIFIER,
    canaryWallet: CANARY,
    registry: REGISTRY,
    artifacts: executorArtifactsV3(),
    capabilityPermissionKeys: productionCapabilityPermissionKeys(),
    tokens: Object.values(PROTOCOL_REGISTRY.aaveV3.assets).map(({ underlying }) => ({
      token: underlying.address,
      maxRoute: 10_000_000n,
      maxWalletDaily: 50_000_000n,
      maxCumulative: 1_000_000_000n,
    })),
  });
  const html = renderMainnetV3DeploymentConsole({ plan, maxFeePerGas: gasPrice * 2n });
  const port = Number(optionalArgument("port") ?? "4178");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error("Invalid --port");
  const server = createServer((request, response) => {
    if (request.url !== "/") { response.writeHead(404).end(); return; }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    });
    response.end(html);
  });
  server.listen(port, "127.0.0.1", () => process.stdout.write([
    `Cobia V3 mainnet deployment console: http://127.0.0.1:${port}`,
    `chain=${chainId} nonce=${nonce} operatorBalanceWei=${balance}`,
    `registry=${plan.registry} riskManager=${plan.riskManager} executorV3=${plan.executor}`,
  ].join("\n") + "\n"));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
