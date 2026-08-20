import { createPublicClient, http, parseAbi } from "viem";
import { xLayer } from "../chain/xlayer";
import { mainnetV3StateSpec } from "../deployment/mainnet-v3-state-runtime";

const ACCESS_ABI = parseAbi([
  "function accessMode() view returns (uint8)",
  "function openAccessAfter() view returns (uint64)",
  "function paused() view returns (bool)",
]);

export type MainnetAccessState = "allowlist" | "scheduled" | "live" | "paused";

export async function readMainnetAccessStatus(rpcUrl?: string) {
  const client = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl ?? process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0], {
      timeout: 10_000,
    }),
    cacheTime: 0,
  });
  if (await client.getChainId() !== 196) throw new Error("Mainnet RPC chain mismatch");
  const blockNumber = await client.getBlockNumber();
  const read = (functionName: "accessMode" | "openAccessAfter" | "paused") => client.readContract({
    address: mainnetV3StateSpec.riskManager,
    abi: ACCESS_ABI,
    functionName,
    blockNumber,
  });
  const [mode, activationAt, paused] = await Promise.all([
    read("accessMode"), read("openAccessAfter"), read("paused"),
  ]);
  const state: MainnetAccessState = paused
    ? "paused"
    : Number(mode) === 1
      ? "live"
      : BigInt(activationAt) > 0n ? "scheduled" : "allowlist";
  return {
    chainId: 196 as const,
    blockNumber: blockNumber.toString(),
    observedAt: new Date().toISOString(),
    state,
    activationAt: Number(activationAt),
  };
}
