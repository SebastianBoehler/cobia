import { discoverCommerceOffersV1 } from "../commerce/discovery-broker";
import { commerceDiscoverySourcesV1 } from "../commerce/discovery-sources";
import { nodeCommerceFetchV1, nodeDnsResolverV1 } from "../commerce/node-commerce-fetch";
import { getCommerceOfferRepository } from "./market";

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
  return {
    offers: await repository.listCurrent(input.nowSec, input.limit),
    sourceErrors: discovered.sourceErrors,
  };
}
