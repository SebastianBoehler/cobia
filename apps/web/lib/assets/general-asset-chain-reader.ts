import type { ClaimedAssetIdentityV1, GeneralAsset, PinnedAssetReaderV1,
  ProxyIdentityV1 } from "@cobia/solvers";
import {
  erc20Abi,
  createPublicClient,
  getAddress,
  isAddressEqual,
  keccak256,
  http,
  parseAbi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { xLayer } from "../chain/xlayer";

export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
export const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const BEACON_ABI = parseAbi(["function implementation() view returns (address)"]);

export interface GeneralAssetViemClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ number: bigint; hash: Hash | null }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  getStorageAt(input: { address: Address; slot: Hex; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(input: Record<string, unknown>): Promise<unknown>;
}

function storageAddress(word: Hex | undefined): Address | undefined {
  if (!word || word.length !== 66 || /^0x0{64}$/.test(word)) return undefined;
  const address = getAddress(`0x${word.slice(-40)}`).toLowerCase() as Address;
  return isAddressEqual(address, ZERO) ? undefined : address;
}

async function codeHash(client: GeneralAssetViemClient, address: Address, blockNumber: bigint): Promise<Hash | null> {
  const code = await client.getCode({ address, blockNumber });
  return !code || code === "0x" ? null : keccak256(code);
}

async function proxyIdentity(
  client: GeneralAssetViemClient,
  token: Address,
  blockNumber: bigint,
): Promise<ProxyIdentityV1> {
  const implementation = storageAddress(await client.getStorageAt({
    address: token, slot: EIP1967_IMPLEMENTATION_SLOT, blockNumber,
  }));
  if (implementation) {
    const implementationRuntimeCodeHash = await codeHash(client, implementation, blockNumber);
    if (!implementationRuntimeCodeHash) throw new Error("Proxy implementation has no runtime code");
    const admin = storageAddress(await client.getStorageAt({
      address: token, slot: EIP1967_ADMIN_SLOT, blockNumber,
    })) ?? null;
    return { kind: "eip1967", implementation, implementationRuntimeCodeHash, admin };
  }
  const beacon = storageAddress(await client.getStorageAt({
    address: token, slot: EIP1967_BEACON_SLOT, blockNumber,
  }));
  if (!beacon) return { kind: "none" };
  const beaconRuntimeCodeHash = await codeHash(client, beacon, blockNumber);
  if (!beaconRuntimeCodeHash) throw new Error("Proxy beacon has no runtime code");
  const implementationAddress = await client.readContract({ address: beacon, abi: BEACON_ABI,
    functionName: "implementation", blockNumber });
  if (typeof implementationAddress !== "string") throw new Error("Proxy beacon implementation is invalid");
  const beaconImplementation = getAddress(implementationAddress).toLowerCase() as Address;
  const implementationRuntimeCodeHash = await codeHash(client, beaconImplementation, blockNumber);
  if (!implementationRuntimeCodeHash) throw new Error("Proxy implementation has no runtime code");
  return { kind: "beacon", beacon, beaconRuntimeCodeHash,
    implementation: beaconImplementation, implementationRuntimeCodeHash };
}

export function createPinnedAssetReaderV1(client: GeneralAssetViemClient): PinnedAssetReaderV1 {
  return {
    latestBlockNumber: async (chainId) => {
      if (await client.getChainId() !== chainId) throw new Error("Asset reader chain ID mismatch");
      return client.getBlockNumber();
    },
    blockHash: async (chainId, blockNumber) => {
      if (await client.getChainId() !== chainId) throw new Error("Asset reader chain ID mismatch");
      return (await client.getBlock({ blockNumber })).hash;
    },
    runtimeCodeHash: async (chainId, address, blockNumber) => {
      if (await client.getChainId() !== chainId) throw new Error("Asset reader chain ID mismatch");
      return codeHash(client, address, blockNumber);
    },
    proxy: async (chainId, token, blockNumber) => {
      if (await client.getChainId() !== chainId) throw new Error("Asset reader chain ID mismatch");
      return proxyIdentity(client, token, blockNumber);
    },
    decimals: async (chainId, token, blockNumber) => {
      if (await client.getChainId() !== chainId) throw new Error("Asset reader chain ID mismatch");
      return Number(await client.readContract({ address: token, abi: erc20Abi,
        functionName: "decimals", blockNumber }));
    },
  };
}

export async function captureGeneralAssetIdentityV1(
  asset: GeneralAsset,
  client: GeneralAssetViemClient,
  nowSec: number,
): Promise<{ anchor: { blockNumber: string; blockHash: Hash; capturedAtSec: number;
  expiresAtSec: number; maximumBlockAge: number }; claimedIdentity: ClaimedAssetIdentityV1;
  reader: PinnedAssetReaderV1 }> {
  if (await client.getChainId() !== asset.chainId) throw new Error("Asset reader chain ID mismatch");
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  if (!block.hash || block.number !== blockNumber) throw new Error("Asset block is not pinned");
  const reader = createPinnedAssetReaderV1(client);
  const [runtimeCodeHash, proxy, decimals] = await Promise.all([
    reader.runtimeCodeHash(asset.chainId, asset.token, blockNumber),
    reader.proxy(asset.chainId, asset.token, blockNumber),
    reader.decimals(asset.chainId, asset.token, blockNumber),
  ]);
  if (!runtimeCodeHash) throw new Error("Token has no runtime code");
  return { anchor: { blockNumber: blockNumber.toString(), blockHash: block.hash,
    capturedAtSec: nowSec, expiresAtSec: nowSec + 60, maximumBlockAge: 8 },
  claimedIdentity: { runtimeCodeHash, proxy, decimals }, reader };
}

function viemClient(chainId: 1 | 196, rpcUrl: string): GeneralAssetViemClient {
  const client = chainId === 1
    ? createPublicClient({ chain: mainnet, transport: http(rpcUrl, { timeout: 15_000 }), cacheTime: 0 })
    : createPublicClient({ chain: xLayer, transport: http(rpcUrl, { timeout: 15_000 }), cacheTime: 0 });
  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: (input) => client.getBlock(input),
    getCode: (input) => client.getCode(input),
    getStorageAt: (input) => client.getStorageAt(input),
    readContract: (input) => client.readContract(input as never),
  };
}

export function createGeneralAssetIdentityCaptureV1(config: {
  ETHEREUM_RPC_URL: string;
  XLAYER_RPC_URL: string;
}, nowSec: () => number = () => Math.floor(Date.now() / 1_000)) {
  const clients = {
    1: viemClient(1, config.ETHEREUM_RPC_URL),
    196: viemClient(196, config.XLAYER_RPC_URL),
  };
  return (asset: GeneralAsset) => captureGeneralAssetIdentityV1(asset, clients[asset.chainId], nowSec());
}
