import { normalizeAaveProduct } from "../okx/normalize";
import { AAVE_V3_POOL } from "../chain/xlayer";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { verifyPolicyOwnerSignature } from "../intents/signature";
import { getRequestRepository, openQuoteMarket } from "./market";

export function createMcpDependencies() {
  return {
    async discoverMarkets() {
      const okx = createOkxClient({ credentials: readOkxCredentials() });
      const markets = await Promise.all(SUPPORTED_ASSETS.map(async (asset) => {
        const products = await okx.searchProducts({
          tokenKeywordList: [asset.symbol],
          platformKeywordList: ["Aave"],
          chainIndex: "196",
          pageNum: 1,
        });
        return Promise.all(products.map(async (product) => {
          const normalized = normalizeAaveProduct(await okx.getProductDetail(product.investmentId), {
            expectedSymbol: asset.symbol,
            expectedAddress: asset.address,
            expectedDecimals: asset.decimals,
            poolAddress: AAVE_V3_POOL,
            retrievedAt: new Date().toISOString(),
          });
          return { chainId: 196, asset: asset.displaySymbol, protocol: "Aave V3", ...normalized.candidate };
        }));
      }));
      return markets.flat();
    },
    getPublicRequest: (requestId: string) =>
      getRequestRepository().getPublicRequest(requestId),
    async submitIntent(policy: Parameters<typeof openQuoteMarket>[0], ownerSignature: `0x${string}`) {
      await verifyPolicyOwnerSignature(policy, ownerSignature);
      const result = await openQuoteMarket(policy);
      return "jobId" in result ? {
        requestId: policy.requestId,
        agentProgramId: result.jobId,
        state: "attested" as const,
      } : {
        requestId: policy.requestId,
        quoteCount: result.quotes.length,
        failureCount: result.failures.length,
      };
    },
  };
}
