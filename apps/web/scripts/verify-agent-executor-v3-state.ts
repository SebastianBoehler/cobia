import { createPublicClient, http } from "viem";
import { xLayer } from "../lib/chain/xlayer";
import {
  createMainnetV3StateReader,
  mainnetV3StateSpec,
  parseMainnetV3StateMode,
} from "../lib/deployment/mainnet-v3-state-runtime";
import { verifyMainnetV3State } from "../lib/deployment/mainnet-v3-state-verifier";

async function main() {
  const mode = parseMainnetV3StateMode(process.argv[2]);
  const rpcUrl = process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0];
  const client = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl, { timeout: 15_000 }),
  });
  const evidence = await verifyMainnetV3State({
    spec: mainnetV3StateSpec,
    reader: createMainnetV3StateReader(client as never),
    mode,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

void main();
