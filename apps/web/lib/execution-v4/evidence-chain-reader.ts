import { createPublicClient, http, keccak256, type Address, type Hash } from "viem";
import { mainnet } from "viem/chains";
import { xLayer } from "../chain/xlayer";
import { readGeneralAssetRpcConfig } from "../env";

type ChainId = 1 | 196;

export function createGeneralAssetEvidenceChainReaderV4() {
  const config = readGeneralAssetRpcConfig();
  const clients = {
    1: createPublicClient({ chain: mainnet,
      transport: http(config.ETHEREUM_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
    196: createPublicClient({ chain: xLayer,
      transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
  };
  return {
    async blockHash(chainId: ChainId, blockNumber: bigint): Promise<Hash | null> {
      return (await clients[chainId].getBlock({ blockNumber })).hash;
    },
    async codeHash(chainId: ChainId, address: Address, blockNumber: bigint): Promise<Hash | null> {
      const code = await clients[chainId].getCode({ address, blockNumber });
      return !code || code === "0x" ? null : keccak256(code);
    },
  };
}
