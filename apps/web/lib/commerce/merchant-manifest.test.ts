import { describe, expect, it } from "vitest";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
} from "./merchant-manifest";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const manifest = {
  version: 1 as const,
  chainId: 196 as const,
  entries: [{
    merchantId: "merchant.example",
    productCommitment: hash("1"),
    payee: "0x1111111111111111111111111111111111111111",
    paymentAsset: "0x2222222222222222222222222222222222222222",
    exactAtomicAmount: "12500000",
    placement: {
      kind: "direct-contract" as const,
      target: "0x3333333333333333333333333333333333333333",
      runtimeCodeHash: hash("2"),
      functionSignature: "placeOrder(bytes32,address,uint256,address,uint256,address)",
      selector: "0x848d6709",
      argumentBindings: [
        "orderCommitment", "receiptRecipient", "quantity", "paymentAsset", "paymentAmount", "paymentPayee",
      ] as const,
      expectedGas: 500_000,
    },
    receipt: {
      kind: "event" as const,
      emitter: "0x3333333333333333333333333333333333333333",
      runtimeCodeHash: hash("2"),
      topic0: hash("3"),
      ownerTopicIndex: 1,
      orderCommitmentTopicIndex: 2,
    },
  }],
  officialSources: ["https://merchant.example/contracts/order"],
};

describe("commerce merchant manifest", () => {
  it("commits code, selector, bindings, payment, and receipt semantics", () => {
    const parsed = CommerceMerchantManifestV1Schema.parse(manifest);
    expect(commerceMerchantManifestCommitmentV1(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(commerceMerchantManifestCommitmentV1({
      ...parsed,
      entries: [{ ...parsed.entries[0]!, payee: "0x4444444444444444444444444444444444444444" }],
    })).not.toBe(commerceMerchantManifestCommitmentV1(parsed));
  });

  it("rejects ABI-only, duplicate, unsorted, native-value, and unbound receipt entries", () => {
    const entry = manifest.entries[0];
    const invalid = [
      { ...manifest, entries: [{ ...entry, runtimeCodeHash: hash("2") }] },
      { ...manifest, entries: [entry, entry] },
      { ...manifest, entries: [{ ...entry, exactAtomicAmount: "0" }] },
      { ...manifest, entries: [{ ...entry, nativeValue: "1" }] },
      { ...manifest, entries: [{ ...entry, receipt: { ...entry.receipt, ownerTopicIndex: 0 } }] },
      { ...manifest, entries: [{ ...entry, placement: { ...entry.placement, selector: "0x00000000" } }] },
    ];
    for (const value of invalid) expect(CommerceMerchantManifestV1Schema.safeParse(value).success).toBe(false);
  });

  it("requires verifier-owned x402 token signing identity", () => {
    const x402 = CommerceMerchantManifestV1Schema.parse({
      version: 1,
      chainId: 196,
      entries: [{
        merchantId: "api.example",
        productCommitment: hash("4"),
        payee: "0x4444444444444444444444444444444444444444",
        paymentAsset: "0x5555555555555555555555555555555555555555",
        exactAtomicAmount: "10000",
        placement: {
          kind: "x402-exact",
          endpoint: "https://api.example/resource",
          facilitator: "https://facilitator.example",
          assetTransferMethod: "eip3009",
          token: { runtimeCodeHash: hash("6"), eip712Name: "USD Coin", eip712Version: "2" },
        },
        receipt: {
          kind: "eip3009-transfer",
          topic0: hash("8"),
          fromTopicIndex: 1,
          toTopicIndex: 2,
        },
      }],
      officialSources: ["https://api.example/contracts"],
    });
    expect(x402.entries[0]?.placement).toMatchObject({
      kind: "x402-exact",
      token: { eip712Name: "USD Coin", eip712Version: "2" },
    });
    expect(() => CommerceMerchantManifestV1Schema.parse({
      ...x402,
      entries: [{ ...x402.entries[0], placement: { ...x402.entries[0]!.placement, token: undefined } }],
    })).toThrow();
  });
});
