import {
  AssetIdentityEvidenceV1Schema,
  type AssetIdentityEvidenceV1,
  type Erc20AssetIdentityEvidenceV1,
} from "@cobia/domain";
import type { Address, Hash } from "viem";

export type GeneralAssetChainId = 1 | 196;
export type GeneralAsset = { chainId: GeneralAssetChainId; token: Address };
export type ProxyIdentityV1 = Erc20AssetIdentityEvidenceV1["proxy"];

export interface ClaimedAssetIdentityV1 {
  runtimeCodeHash: Hash;
  proxy: ProxyIdentityV1;
  decimals: number;
}

export interface AssetIdentityAnchorV1 {
  blockNumber: string;
  blockHash: Hash;
  capturedAtSec: number;
  expiresAtSec: number;
  maximumBlockAge: number;
}

export interface PinnedAssetReaderV1 {
  latestBlockNumber(chainId: GeneralAssetChainId): Promise<bigint>;
  blockHash(chainId: GeneralAssetChainId, blockNumber: bigint): Promise<Hash | null>;
  runtimeCodeHash(chainId: GeneralAssetChainId, address: Address, blockNumber: bigint): Promise<Hash | null>;
  proxy(chainId: GeneralAssetChainId, token: Address, blockNumber: bigint): Promise<ProxyIdentityV1>;
  decimals(chainId: GeneralAssetChainId, token: Address, blockNumber: bigint): Promise<number>;
}

export interface IdentityVerificationInputV1 {
  asset: GeneralAsset;
  anchor: AssetIdentityAnchorV1;
  claimedIdentity: ClaimedAssetIdentityV1;
  reader: PinnedAssetReaderV1;
  nowSec: number;
}

export interface IdentityVerificationResultV1 {
  errorCodes: string[];
  evidence?: AssetIdentityEvidenceV1;
}

function sameProxy(left: ProxyIdentityV1, right: ProxyIdentityV1): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "none" || right.kind === "none") return true;
  if (left.implementation !== right.implementation ||
      left.implementationRuntimeCodeHash !== right.implementationRuntimeCodeHash) return false;
  if (left.kind === "eip1967" && right.kind === "eip1967") return left.admin === right.admin;
  return left.kind === "beacon" && right.kind === "beacon" &&
    left.beacon === right.beacon && left.beaconRuntimeCodeHash === right.beaconRuntimeCodeHash;
}

export async function verifyAssetIdentityV1(
  input: IdentityVerificationInputV1,
): Promise<IdentityVerificationResultV1> {
  const errors = new Set<string>();
  const blockNumber = BigInt(input.anchor.blockNumber);
  if (input.anchor.expiresAtSec <= input.nowSec) errors.add("ASSET_EVIDENCE_EXPIRED");
  if (input.anchor.capturedAtSec > input.nowSec) errors.add("ASSET_EVIDENCE_FROM_FUTURE");

  const latestBlock = await input.reader.latestBlockNumber(input.asset.chainId);
  if (latestBlock < blockNumber || latestBlock - blockNumber > BigInt(input.anchor.maximumBlockAge)) {
    errors.add("ASSET_BLOCK_STALE");
  }
  if (await input.reader.blockHash(input.asset.chainId, blockNumber) !== input.anchor.blockHash) {
    errors.add("ASSET_BLOCK_HASH_DRIFT");
  }
  if (await input.reader.runtimeCodeHash(input.asset.chainId, input.asset.token, blockNumber) !==
      input.claimedIdentity.runtimeCodeHash) errors.add("ASSET_RUNTIME_DRIFT");

  const observedProxy = await input.reader.proxy(input.asset.chainId, input.asset.token, blockNumber);
  if (!sameProxy(input.claimedIdentity.proxy, observedProxy)) {
    const implementationChanged = input.claimedIdentity.proxy.kind !== "none" &&
      observedProxy.kind !== "none" &&
      (input.claimedIdentity.proxy.implementation !== observedProxy.implementation ||
       input.claimedIdentity.proxy.implementationRuntimeCodeHash !== observedProxy.implementationRuntimeCodeHash);
    errors.add(implementationChanged ? "ASSET_IMPLEMENTATION_DRIFT" : "ASSET_PROXY_DRIFT");
  }
  if (input.claimedIdentity.proxy.kind !== "none" &&
      await input.reader.runtimeCodeHash(
        input.asset.chainId, input.claimedIdentity.proxy.implementation, blockNumber,
      ) !== input.claimedIdentity.proxy.implementationRuntimeCodeHash) {
    errors.add("ASSET_IMPLEMENTATION_DRIFT");
  }

  const decimals = await input.reader.decimals(input.asset.chainId, input.asset.token, blockNumber);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    errors.add("ASSET_DECIMALS_UNSUPPORTED");
  } else if (decimals !== input.claimedIdentity.decimals) {
    errors.add("ASSET_DECIMALS_DRIFT");
  }
  if (errors.size > 0) return { errorCodes: [...errors].sort() };

  return {
    errorCodes: [],
    evidence: AssetIdentityEvidenceV1Schema.parse({
      version: 1,
      ...input.asset,
      runtimeCodeHash: input.claimedIdentity.runtimeCodeHash,
      proxy: input.claimedIdentity.proxy,
      decimals,
      behaviorModule: { id: "plain-erc20", version: 1 },
      blockNumber: input.anchor.blockNumber,
      blockHash: input.anchor.blockHash,
      capturedAtSec: input.anchor.capturedAtSec,
      expiresAtSec: input.anchor.expiresAtSec,
    }),
  };
}
