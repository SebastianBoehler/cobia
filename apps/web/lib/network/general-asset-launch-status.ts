import { createPublicClient, http, parseAbi } from "viem";
import { xLayer } from "../chain/xlayer";
import { readGeneralAssetV4Config } from "../env";

const RISK_ABI = parseAbi([
  "function accessMode() view returns (uint8)",
  "function openAccessAfter() view returns (uint64)",
  "function paused() view returns (bool)",
  "function unpauseAfter() view returns (uint64)",
]);

export type GeneralAssetLaunchState = "preparing" | "canary-scheduled" | "canary-live" |
  "public-scheduled" | "live" | "unavailable";

export interface GeneralAssetLaunchStatus {
  state: GeneralAssetLaunchState;
  activationAt: number;
}

export function classifyGeneralAssetLaunchStatus(input: {
  accessMode: number;
  openAccessAfter: number;
  paused: boolean;
  unpauseAfter: number;
}): GeneralAssetLaunchStatus {
  if (input.accessMode === 1 && !input.paused) {
    return { state: "live", activationAt: 0 };
  }
  if (input.unpauseAfter > 0) {
    return { state: "canary-scheduled", activationAt: input.unpauseAfter };
  }
  if (input.paused) return { state: "preparing", activationAt: 0 };
  if (input.openAccessAfter > 0) {
    return { state: "public-scheduled", activationAt: input.openAccessAfter };
  }
  return { state: "canary-live", activationAt: 0 };
}

export async function readGeneralAssetLaunchStatus(rpcUrl?: string): Promise<GeneralAssetLaunchStatus> {
  const config = readGeneralAssetV4Config().entries.find(({ chainId }) => chainId === 196);
  if (!config) throw new Error("X Layer V4 launch configuration is unavailable");

  const client = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl ?? process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0], {
      timeout: 10_000,
    }),
    cacheTime: 0,
  });
  if (await client.getChainId() !== 196) throw new Error("Mainnet RPC chain mismatch");
  const blockNumber = await client.getBlockNumber();
  const riskRead = (functionName: "accessMode" | "openAccessAfter" | "paused" | "unpauseAfter") =>
    client.readContract({ address: config.riskManager, abi: RISK_ABI, functionName, blockNumber });
  const [accessMode, openAccessAfter, paused, unpauseAfter] = await Promise.all([
    riskRead("accessMode"), riskRead("openAccessAfter"), riskRead("paused"), riskRead("unpauseAfter"),
  ]);
  return classifyGeneralAssetLaunchStatus({
    accessMode: Number(accessMode),
    openAccessAfter: Number(openAccessAfter), paused: paused === true,
    unpauseAfter: Number(unpauseAfter),
  });
}
