import { registryHash, PROTOCOL_REGISTRY, type PinnedDeployment } from "../adapters/registry";
import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";
import { z } from "zod";

export const AddressSchema = z.string().refine(isAddress).transform((value) => getAddress(value));
export const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/);
const ManifestSchema = z.object({
  version: z.literal(1),
  chainId: z.literal(196),
  registryHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).passthrough();

export function assertProductionManifest(input: unknown, expectedHash: string): void {
  const manifest = ManifestSchema.parse(input);
  if (manifest.registryHash.toLowerCase() !== registryHash.toLowerCase() ||
    expectedHash.toLowerCase() !== registryHash.toLowerCase()) {
    throw new Error("Capability program manifest does not match the production registry");
  }
}

export function registeredAsset(address: Address) {
  const asset = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find((candidate) =>
    isAddressEqual(candidate.underlying.address, address));
  if (!asset) throw new Error("Capability asset is not registered");
  return asset;
}

export function registeredPair(tokenIn: Address, tokenOut: Address) {
  const input = registeredAsset(tokenIn);
  const output = registeredAsset(tokenOut);
  if (input === output) throw new Error("Capability tokens are not a registered pair");
  return { input, output };
}

export function selectorOf(data: Hex): Hex {
  return data.slice(0, 10) as Hex;
}

export function pinned(...deployments: PinnedDeployment[]) {
  return deployments;
}
