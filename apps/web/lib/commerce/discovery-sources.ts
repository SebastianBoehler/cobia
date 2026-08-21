import type { CommerceDiscoverySourceV1 } from "./discovery-broker";
import { commerceMerchantManifestCommitmentV1 } from "./merchant-manifest";
import { productionCommerceMerchantManifestV1 } from "./production-manifest";

const manifestHash = commerceMerchantManifestCommitmentV1(productionCommerceMerchantManifestV1());

export const commerceDiscoverySourcesV1: readonly CommerceDiscoverySourceV1[] = [{
  id: "ethy-xlayer-score",
  protocol: "x402-resource",
  url: "https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736",
  trustedResources: {
    "https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736": {
      manifestHash,
      merchantDisplayName: "Ethy AI",
      productCommitment: productionCommerceMerchantManifestV1().entries[0]!.productCommitment,
    },
  },
}];
