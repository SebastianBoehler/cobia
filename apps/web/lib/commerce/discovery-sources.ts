import type { CommerceDiscoverySourceV1 } from "./discovery-broker";
import { commerceMerchantManifestCommitmentV1 } from "./merchant-manifest";
import { productionCommerceMerchantManifestV1 } from "./production-manifest";

const manifestHash = commerceMerchantManifestCommitmentV1(productionCommerceMerchantManifestV1());

export const commerceDiscoverySourcesV1: readonly CommerceDiscoverySourceV1[] = [{
  id: "cdp-x402-bazaar",
  protocol: "x402-bazaar",
  url: "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=20",
  trustedResources: {
    "https://api.onesource.io/api/chain/block-number": {
      manifestHash,
      merchantDisplayName: "OneSource",
    },
  },
}];
