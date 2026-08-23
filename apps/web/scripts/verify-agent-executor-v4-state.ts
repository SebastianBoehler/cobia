import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, type Hash } from "viem";
import { mainnet } from "viem/chains";
import { xLayer } from "../lib/chain/xlayer";
import {
  createMainnetV4StateReader,
  verifyMainnetV4State,
  type MainnetV4StateSpec,
  type V4ReleaseMode,
} from "../lib/deployment/mainnet-v4-state-verifier";
import { argument, optionalArgument } from "./executor-deployment-input";

function mode(value: unknown): V4ReleaseMode {
  if (value !== "proposed" && value !== "canary" && value !== "open") {
    throw new Error("V4 verification mode must be proposed, canary, or open");
  }
  return value;
}
function spec(path: string): MainnetV4StateSpec {
  const raw = JSON.parse(readFileSync(path, "utf8")) as MainnetV4StateSpec;
  return { ...raw, owner: getAddress(raw.owner), verifier: getAddress(raw.verifier),
    registry: getAddress(raw.registry), riskManager: getAddress(raw.riskManager),
    executor: getAddress(raw.executor), canary: getAddress(raw.canary),
    codeHashes: raw.codeHashes,
    permissions: raw.permissions.map((permission) => ({ ...permission,
      key: permission.key as Hash, target: getAddress(permission.target) })) };
}

async function main() {
  const releaseMode = mode(process.argv[2]);
  const expected = spec(argument("spec"));
  const rpcUrl = optionalArgument("rpc") ?? (expected.chainId === 1
    ? process.env.ETHEREUM_RPC_URL ?? mainnet.rpcUrls.default.http[0]
    : process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0]);
  const client = createPublicClient({ chain: expected.chainId === 1 ? mainnet : xLayer,
    transport: http(rpcUrl, { timeout: 15_000 }), cacheTime: 0 });
  const evidence = await verifyMainnetV4State({ spec: expected,
    reader: createMainnetV4StateReader(client as never), mode: releaseMode });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
void main();
