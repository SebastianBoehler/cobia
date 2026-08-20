import type { CommerceOfferV1 } from "@cobia/domain";
import { formatUnits, isAddressEqual } from "viem";
import { SUPPORTED_ASSETS } from "../../lib/chain/supported-assets";

export function humanizeIdentifier(value: string) {
  const words = value.replaceAll("-", " ").replaceAll("_", " ");
  return words[0]?.toUpperCase() + words.slice(1).toLowerCase();
}

export function productName(offer: CommerceOfferV1) {
  if (offer.product.name) return offer.product.name;
  if (offer.placement.kind === "direct-contract") return humanizeIdentifier(offer.product.id);
  const segment = new URL(offer.placement.endpoint).pathname.split("/")
    .filter((part) => part && !part.startsWith(":"))
    .at(-1);
  return segment ? humanizeIdentifier(decodeURIComponent(segment)) : "Unnamed paid resource";
}

export function paymentDisplay(offer: CommerceOfferV1) {
  const asset = offer.payment.chainId === 196
    ? SUPPORTED_ASSETS.find((candidate) => isAddressEqual(candidate.address, offer.payment.asset))
    : undefined;
  if (!asset) return `${offer.payment.atomicAmount} atomic · ${offer.payment.asset}`;
  return `${formatUnits(BigInt(offer.payment.atomicAmount), asset.decimals)} ${asset.displaySymbol}`;
}

export function networkName(chainId: number) {
  if (chainId === 196) return "X Layer";
  if (chainId === 8453) return "Base";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}
