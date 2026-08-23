import { createPublicClient, http, keccak256, parseAbi, stringToHex,
  type Address, type Hex } from "viem";
import { xLayer } from "../chain/xlayer";
import { readGeneralAssetManifest, readGeneralAssetV4Config } from "../env";

const RISK_ABI = parseAbi([
  "function accessMode() view returns (uint8)",
  "function openAccessAfter() view returns (uint64)",
  "function paused() view returns (bool)",
  "function unpauseAfter() view returns (uint64)",
]);

const REGISTRY_ABI = parseAbi([
  "function isActive(bytes32 adapterId,address target,bytes4 selector) view returns (bool)",
]);

export type GeneralAssetLaunchState = "preparing" | "canary-scheduled" | "canary-live" |
  "public-scheduled" | "live" | "unavailable";

export interface GeneralAssetLaunchStatus {
  state: GeneralAssetLaunchState;
  activationAt: number;
}

export function classifyGeneralAssetLaunchStatus(input: {
  accessMode: number;
  adapterActive: boolean;
  openAccessAfter: number;
  paused: boolean;
  unpauseAfter: number;
}): GeneralAssetLaunchStatus {
  if (input.accessMode === 1 && !input.paused && input.adapterActive) {
    return { state: "live", activationAt: 0 };
  }
  if (input.openAccessAfter > 0) {
    return { state: "public-scheduled", activationAt: input.openAccessAfter };
  }
  if (!input.paused && input.adapterActive) return { state: "canary-live", activationAt: 0 };
  if (input.unpauseAfter > 0) {
    return { state: "canary-scheduled", activationAt: input.unpauseAfter };
  }
  return { state: "preparing", activationAt: 0 };
}

export async function readGeneralAssetLaunchStatus(rpcUrl?: string): Promise<GeneralAssetLaunchStatus> {
  const config = readGeneralAssetV4Config().entries.find(({ chainId }) => chainId === 196);
  const entry = readGeneralAssetManifest().entries.find(({ chainId, adapter }) =>
    chainId === 196 && adapter.id === "okx.swap" && adapter.version === 1);
  const selector = entry?.selectors[0];
  if (!config || !entry || !selector) throw new Error("X Layer V4 launch configuration is unavailable");

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
  const [accessMode, openAccessAfter, paused, unpauseAfter, adapterActive] = await Promise.all([
    riskRead("accessMode"), riskRead("openAccessAfter"), riskRead("paused"), riskRead("unpauseAfter"),
    client.readContract({ address: config.registry, abi: REGISTRY_ABI, functionName: "isActive",
      args: [keccak256(stringToHex("okx.swap@1")), entry.target as Address, selector as Hex], blockNumber }),
  ]);
  return classifyGeneralAssetLaunchStatus({
    accessMode: Number(accessMode), adapterActive: adapterActive === true,
    openAccessAfter: Number(openAccessAfter), paused: paused === true,
    unpauseAfter: Number(unpauseAfter),
  });
}
