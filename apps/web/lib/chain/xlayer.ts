import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Hash,
} from "viem";

// BGD Aave address book, main@70e2f303fe93616784148d6827df6644e5dda4db.
// Each address is also checked against X Layer RPC before release.
export const AAVE_V3_POOL: Address =
  "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116";
export const USDG_ADDRESS: Address =
  "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";
export const USDG_A_TOKEN: Address =
  "0x228765a3C18065C923F23a0CCb6c7cEFB3eA2223";
export const USDC_ADDRESS: Address =
  "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://web3.okx.com/explorer/xlayer" },
  },
});

export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech/terigon"] } },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://web3.okx.com/explorer/xlayer-test" },
  },
  testnet: true,
});

export interface SnapshotBlock {
  number: bigint;
  hash: Hash;
}

export interface SnapshotBlockReader {
  getLatestBlock(): Promise<SnapshotBlock>;
}

export function createXLayerBlockReader(
  rpcUrl: string = xLayer.rpcUrls.default.http[0],
): SnapshotBlockReader {
  const client = createPublicClient({ chain: xLayer, transport: http(rpcUrl) });
  return {
    async getLatestBlock() {
      const block = await client.getBlock({ blockTag: "latest" });
      if (!block.hash) throw new Error("X Layer returned a block without a hash");
      return { number: block.number, hash: block.hash };
    },
  };
}
