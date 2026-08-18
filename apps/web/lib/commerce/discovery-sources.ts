import type { CommerceDiscoverySourceV1 } from "./discovery-broker";

export const commerceDiscoverySourcesV1: readonly CommerceDiscoverySourceV1[] = [{
  id: "cdp-x402-bazaar",
  protocol: "x402-bazaar",
  url: "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=20",
  trustedMerchants: {},
}];
