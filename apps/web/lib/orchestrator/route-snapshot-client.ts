import { createPublicClient, http, type PublicClient } from "viem";
import { readAaveOraclePrices } from "../adapters/aave-oracle-reader";
import { readAaveReserve } from "../adapters/aave-reader";
import { createProtocolReadClient } from "../adapters/read-client";
import { quoteUniswapExactInputSingle } from "../adapters/uniswap-reader";
import { readUniswapFullRangeState } from "../adapters/uniswap-lp-reader";
import { xLayer } from "../chain/xlayer";
import type { RouteSnapshotV2Dependencies } from "./capture-route-snapshot-v2";

type XLayerPublicClient = Pick<
  PublicClient,
  "getBlock" | "getChainId" | "getCode" | "getStorageAt" | "readContract"
>;

export function routeSnapshotDependencies(
  publicClient: XLayerPublicClient,
): RouteSnapshotV2Dependencies {
  const protocolClient = createProtocolReadClient(publicClient);
  return {
    async getLatestBlock() {
      const block = await publicClient.getBlock({ blockTag: "latest" });
      if (!block.hash) throw new Error("X Layer returned a block without a hash");
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    async getBlock(blockNumber) {
      const block = await publicClient.getBlock({ blockNumber });
      if (!block.hash) throw new Error("X Layer returned a block without a hash");
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    readOraclePrices: (input) => readAaveOraclePrices(protocolClient, input),
    readReserve: (input) => readAaveReserve(protocolClient, input),
    quoteExactInput: (input) => quoteUniswapExactInputSingle(protocolClient, input),
    readFullRangeState: (input) => readUniswapFullRangeState(protocolClient, input),
  };
}

export function createLiveRouteSnapshotDependencies(
  rpcUrl: string = xLayer.rpcUrls.default.http[0],
): RouteSnapshotV2Dependencies {
  return routeSnapshotDependencies(createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl),
  }));
}
