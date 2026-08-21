import { discoverCommerceOffersV1 } from "../commerce/discovery-broker";
import { commerceDiscoverySourcesV1 } from "../commerce/discovery-sources";
import { nodeCommerceFetchV1, nodeDnsResolverV1 } from "../commerce/node-commerce-fetch";
import { getCommerceOfferRepository } from "./market";
import { unstable_cache } from "next/cache";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export async function refreshCommerceDiscoveryV1(input: { nowSec: number; limit: number }) {
  const repository = getCommerceOfferRepository();
  const discovered = await discoverCommerceOffersV1({
    sources: commerceDiscoverySourcesV1,
    dnsResolver: nodeDnsResolverV1,
    fetcher: nodeCommerceFetchV1,
    nowSec: input.nowSec,
    receiptRecipient: ZERO_ADDRESS,
  });
  await Promise.all(discovered.offers.map((offer) => repository.store(offer)));
  const offers = [...discovered.offers].sort((left, right) => {
    const leftRank = left.eligibility.status === "executable" ? 0 : 1;
    const rightRank = right.eligibility.status === "executable" ? 0 : 1;
    return leftRank - rightRank || left.offerId.localeCompare(right.offerId);
  }).slice(0, input.limit);
  return {
    offers,
    sourceErrors: discovered.sourceErrors,
  };
}

export const readCachedCommerceDiscoveryV1 = unstable_cache(
  async (limit: number) => refreshCommerceDiscoveryV1({
    nowSec: Math.floor(Date.now() / 1_000),
    limit,
  }),
  ["commerce-discovery-v1"],
  { revalidate: 30, tags: ["commerce-discovery-v1"] },
);
