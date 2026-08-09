import { normalizeAaveProduct } from "../okx/normalize";
import { AAVE_V3_POOL } from "../chain/xlayer";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { verifyPolicyOwnerSignature } from "../intents/signature";
import { getRequestRepository, openQuoteMarket } from "./market";

export function createMcpDependencies() {
  return {
    async discoverMarkets() {
      const okx = createOkxClient({ credentials: readOkxCredentials() });
      const products = await okx.searchProducts({
        tokenKeywordList: ["USDG"],
        platformKeywordList: ["AAVE V3"],
        chainIndex: "196",
        productGroup: "LENDING",
        pageNum: 1,
      });
      return Promise.all(products.map(async (product) => {
        const normalized = normalizeAaveProduct(await okx.getProductDetail(product.investmentId), {
          expectedSymbol: "USDG",
          poolAddress: AAVE_V3_POOL,
          retrievedAt: new Date().toISOString(),
        });
        return { chainId: 196, asset: "USDG", protocol: "Aave V3", ...normalized.candidate };
      }));
    },
    getPublicRequest: (requestId: string) =>
      getRequestRepository().getPublicRequest(requestId),
    async submitIntent(policy: Parameters<typeof openQuoteMarket>[0], ownerSignature: `0x${string}`) {
      await verifyPolicyOwnerSignature(policy, ownerSignature);
      const result = await openQuoteMarket(policy);
      return {
        requestId: policy.requestId,
        quoteCount: result.quotes.length,
        failureCount: result.failures.length,
      };
    },
  };
}
