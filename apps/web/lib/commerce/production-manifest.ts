import { CommerceMerchantManifestV1Schema } from "./merchant-manifest";

export function productionCommerceMerchantManifestV1() {
  return CommerceMerchantManifestV1Schema.parse({
    version: 1,
    chainId: 8453,
    entries: [{
      merchantId: "api.onesource.io",
      productCommitment: "0x7066f1edbf3615f12aabcfbcf50944743e505c55466871dbad84b724ff550566",
      payee: "0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea",
      paymentAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      exactAtomicAmount: "1000",
      placement: {
        kind: "x402-exact",
        endpoint: "https://api.onesource.io/api/chain/block-number",
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
      "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100",
      "https://docs.cdp.coinbase.com/x402/welcome",
    ],
  });
}
