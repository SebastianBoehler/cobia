import type { Address } from "viem";

export const NATIVE_ASSET_ADDRESS =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;

export function isNativeAssetAddress(value: string): boolean {
  return value.toLowerCase() === NATIVE_ASSET_ADDRESS;
}
