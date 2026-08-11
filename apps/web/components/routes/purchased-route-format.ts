import type { AssetValuationV2 } from "@cobia/domain";
import { formatUnits, isAddressEqual, type Address } from "viem";
import { SUPPORTED_ASSETS } from "../../lib/chain/supported-assets";

export function amountLabel(amountAtomic: bigint, decimals: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals })
    .format(Number(formatUnits(amountAtomic, decimals)));
}

export function assetDisplay(
  address: Address,
  valuations: readonly AssetValuationV2[],
): {
  decimals: number;
  symbol: string;
} {
  const valuation = valuations.find((item) => isAddressEqual(item.asset, address));
  if (!valuation) throw new Error("Purchased route asset metadata is unavailable");
  const asset = SUPPORTED_ASSETS.find((item) => isAddressEqual(item.address, address));
  return {
    decimals: valuation.decimals,
    symbol: asset?.displaySymbol ?? `${address.slice(0, 8)}…${address.slice(-6)}`,
  };
}

export function formattedAssetAmount(
  amountAtomic: string,
  address: Address,
  valuations: readonly AssetValuationV2[],
): string {
  const asset = assetDisplay(address, valuations);
  return `${amountLabel(BigInt(amountAtomic), asset.decimals)} ${asset.symbol}`;
}
