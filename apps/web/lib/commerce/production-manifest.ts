import { CommerceMerchantManifestV1Schema } from "./merchant-manifest";

export function productionCommerceMerchantManifestV1() {
  return CommerceMerchantManifestV1Schema.parse({
    version: 1,
    chainId: 196,
    entries: [{
      merchantId: "api.ethyai.app",
      productCommitment: "0x434118bff8e40716f2f557bd1f829da997b6abf0cf8de5bfd0006b1ab7aaa0d0",
      payee: "0xe8067e3c72f18054de14e4950480c093156130f8",
      paymentAsset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      exactAtomicAmount: "100000",
      placement: {
        kind: "x402-exact",
        endpoint: "https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736",
        facilitator: "https://web3.okx.com/api/v6/pay/x402",
        assetTransferMethod: "eip3009",
        token: {
          runtimeCodeHash: "0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e",
          eip712Name: "USD₮0",
          eip712Version: "1",
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
      "https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736",
      "https://web3.okx.com/onchainos/dev-docs/payments/supported-networks",
      "https://www.okx.ai/agents/1851",
    ],
  });
}
