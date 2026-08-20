import { CommerceMerchantManifestV1Schema } from "./merchant-manifest";

export function productionCommerceMerchantManifestV1() {
  return CommerceMerchantManifestV1Schema.parse({
    version: 1,
    chainId: 8453,
    entries: [{
      merchantId: "api.agentstools.dev",
      productCommitment: "0xb748b1be9d28aebede0025fcaa4b5993e938ec57490383a05ab5014f5c11e0b7",
      payee: "0xf22e558a00d91ee12a1f50c52186fecb8ddff493",
      paymentAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      exactAtomicAmount: "5000",
      placement: {
        kind: "x402-exact",
        endpoint: "https://api.agentstools.dev/crypto/news",
        facilitator: "https://api.cdp.coinbase.com/platform/v2/x402",
        assetTransferMethod: "eip3009",
        token: {
          runtimeCodeHash: "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
          eip712Name: "USD Coin",
          eip712Version: "2",
        },
      },
      receipt: {
        kind: "eip3009-transfer",
        topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        fromTopicIndex: 1,
        toTopicIndex: 2,
      },
    }],
    officialSources: [
      "https://api.agentstools.dev/crypto/news",
      "https://docs.cdp.coinbase.com/x402/welcome",
    ],
  });
}
