import { CommerceMerchantManifestV1Schema } from "./merchant-manifest";

/**
 * Verifier-owned production allowlist. Empty is intentional: public discovery
 * remains available, while execution fails closed until a real X Layer
 * merchant deployment and its semantics have been independently verified.
 */
export function productionCommerceMerchantManifestV1() {
  return CommerceMerchantManifestV1Schema.parse({
    version: 1,
    chainId: 196,
    entries: [],
    officialSources: [],
  });
}
