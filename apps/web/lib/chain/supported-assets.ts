import { getAddress, isAddressEqual, type Address } from "viem";
import { USDG_ADDRESS } from "./xlayer";

export interface SupportedAsset {
  address: Address;
  symbol: "USDG" | "USDT";
  displaySymbol: "USDG" | "USDt0";
  decimals: 6;
  adapter: "aave-v3";
}

export const USDT_ADDRESS: Address = getAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736");

export const SUPPORTED_ASSETS: readonly SupportedAsset[] = [
  { address: USDG_ADDRESS, symbol: "USDG", displaySymbol: "USDG", decimals: 6, adapter: "aave-v3" },
  { address: USDT_ADDRESS, symbol: "USDT", displaySymbol: "USDt0", decimals: 6, adapter: "aave-v3" },
];

export function supportedAsset(address: Address): SupportedAsset {
  const asset = SUPPORTED_ASSETS.find((item) => isAddressEqual(item.address, address));
  if (!asset) throw new Error("Policy asset is not supported for execution");
  return asset;
}
