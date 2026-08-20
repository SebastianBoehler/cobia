import type { CommerceDiscoverySourceV1 } from "./discovery-broker";
import { commerceMerchantManifestCommitmentV1 } from "./merchant-manifest";
import { productionCommerceMerchantManifestV1 } from "./production-manifest";

const manifestHash = commerceMerchantManifestCommitmentV1(productionCommerceMerchantManifestV1());

export const commerceDiscoverySourcesV1: readonly CommerceDiscoverySourceV1[] = [{
  id: "agent-tools-crypto-news",
  protocol: "x402-resource",
  url: "https://api.agentstools.dev/crypto/news",
  trustedResources: {
    "https://api.agentstools.dev/crypto/news": {
      manifestHash,
      merchantDisplayName: "Agent Tools",
      productCommitment: productionCommerceMerchantManifestV1().entries[0]!.productCommitment,
    },
  },
}, {
  id: "cdp-x402-bazaar",
  protocol: "x402-bazaar",
  url: "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=20",
  trustedResources: {},
}];
