import { getAddress, parseAbi, type Address, type Hash, type Hex } from "viem";
import type { MainnetV3StateReader, MainnetV3StateSpec } from "./mainnet-v3-state-verifier";

const READ_ABI = parseAbi([
  "function owner() view returns (address)",
  "function verifierSigner() view returns (address)",
  "function executor() view returns (address)",
  "function paused() view returns (bool)",
  "function accessMode() view returns (uint8)",
  "function pendingVerifier() view returns (address)",
  "function verifierActivateAfter() view returns (uint64)",
  "function openAccessAfter() view returns (uint64)",
  "function pendingToken(address token) view returns ((uint128 maxRoute,uint128 maxWalletDaily,uint128 maxCumulative) limits,uint64 activateAfter)",
  "function tokenEnabled(address token) view returns (bool)",
  "function tokenLimits(address token) view returns (uint128 maxRoute,uint128 maxWalletDaily,uint128 maxCumulative)",
  "function walletAllowAfter(address wallet) view returns (uint64)",
  "function walletAllowed(address wallet) view returns (bool)",
  "function walletDenied(address wallet) view returns (bool)",
  "function unpauseAfter() view returns (uint64)",
  "function permissions(bytes32 key) view returns (bytes32 runtimeCodeHash,address target,uint64 activateAfter,bool active)",
  "function registry() view returns (address)",
  "function riskManager() view returns (address)",
]);

const limits = { maxRoute: 10_000_000n, maxWalletDaily: 50_000_000n, maxCumulative: 1_000_000_000n };

export function parseMainnetV3StateMode(value: unknown): "proposed" | "active" {
  if (value !== "proposed" && value !== "active") {
    throw new Error("V3 verification mode must be proposed or active");
  }
  return value;
}

export const mainnetV3StateSpec: MainnetV3StateSpec = {
  chainId: 196,
  owner: getAddress("0x08eea990F0b165A20d723e59517044a519C83351"),
  verifier: getAddress("0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4"),
  registry: getAddress("0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877"),
  riskManager: getAddress("0xc69A1Fb1DD8AeECfbc557e4fc6a03E5a95201ded"),
  executor: getAddress("0xa31dDF9b68F0d3cE859c3dC2c12e17d9288231A0"),
  canary: getAddress("0x9Afbf85e52612A9922617aDdA9569e13f565de31"),
  activationAtSec: 1_787_229_041,
  codeHashes: {
    riskManager: "0xe415bc68d215ff3c077c707e4493c0517b6ad76446feb49c0fe6cc00add9372c",
    executor: "0x3f8d413eb3adc61d371012de8cb0aad91817bd3f077529bad2ee329aef103894",
  },
  tokens: [
    { token: getAddress("0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"), limits },
    { token: getAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736"), limits },
  ],
  permissions: [{
    key: "0x98b745dbd5f4dcab980c9631ea137505eb1431b779611e060855483aca066b5d",
    target: getAddress("0xE3F3Caefdd7180F884c01E57f65Df979Af84f116"),
    runtimeCodeHash: "0xade071cf93d723c0a6c61715d4d162c611d10fc9c6a6e785c7475af8d10c36fd",
    activateAfterSec: 1_786_990_660,
  }, {
    key: "0x75698503fb23302b6941eaf50de1432de26aeedf682a77f94012372b1c71c235",
    target: getAddress("0x31F066aA0A687d4F383F96a514984AF727Eb8e38"),
    runtimeCodeHash: "0x855800c63268949eadd5206e5729c69e768f017722f275e90c4185b1fb0733bc",
    activateAfterSec: 1_786_990_660,
  }, {
    key: "0x84f8b37251137c01d9bbaea8e647481426d165f476d76eb9cfd9d5134af65741",
    target: getAddress("0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA"),
    runtimeCodeHash: "0x83ee2f04768ca84e762b139bf36844bf7efbd75b3c7cc898705169eacb9d5102",
    activateAfterSec: 1_786_990_660,
  }],
};

interface MainnetV3PublicClient {
  getChainId(): Promise<number>;
  getBlock(input: { blockTag?: "latest"; blockNumber?: bigint }): Promise<{
    number?: bigint; hash: Hash | null; timestamp?: bigint;
  }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(input: {
    address: Address; abi: typeof READ_ABI; functionName: string;
    args: readonly unknown[]; blockNumber: bigint;
  }): Promise<unknown>;
}

function tuple(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} returned a malformed tuple`);
  return value;
}

function normalizeLimits(value: unknown) {
  if (Array.isArray(value)) {
    return { maxRoute: value[0], maxWalletDaily: value[1], maxCumulative: value[2] };
  }
  return value;
}

function normalizeValue(field: string, value: unknown): unknown {
  if (field === "pendingToken") {
    const result = tuple(value, field);
    return { limits: normalizeLimits(result[0]), activateAfter: result[1] };
  }
  if (field === "tokenLimits") return normalizeLimits(value);
  if (field === "permissions") {
    const result = tuple(value, field);
    return {
      runtimeCodeHash: result[0], target: result[1], activateAfter: result[2], active: result[3],
    };
  }
  return value;
}

export function createMainnetV3StateReader(client: MainnetV3PublicClient): MainnetV3StateReader {
  return {
    chainId: () => client.getChainId(),
    async latestBlock() {
      const block = await client.getBlock({ blockTag: "latest" });
      if (block.number === undefined || block.hash === null || block.timestamp === undefined) {
        throw new Error("Latest X Layer block is incomplete");
      }
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    },
    async blockHash(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (block.hash === null) throw new Error("Pinned X Layer block is unavailable");
      return block.hash;
    },
    async code(address, blockNumber) {
      return await client.getCode({ address, blockNumber }) ?? "0x";
    },
    async contractValue(address, field, args = [], blockNumber) {
      const value = await client.readContract({
        address, abi: READ_ABI, functionName: field, args, blockNumber,
      });
      return normalizeValue(field, value);
    },
  };
}
