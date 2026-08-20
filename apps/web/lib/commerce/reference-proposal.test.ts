import { commerceMerchantManifestCommitmentV1 } from "./merchant-manifest";
import { productionCommerceMerchantManifestV1 } from "./production-manifest";
import { buildReferenceCommerceProposalV1 } from "./reference-proposal";
import { verifyCommerceProgramV1 } from "./program-verifier";
import { normalizeX402ResourceV1 } from "./x402-wire";
import { reproduceX402PlanV1 } from "./x402-reproduction";
import { describe, expect, it } from "vitest";

const owner = "0x1111111111111111111111111111111111111111" as const;
const executor = "0x2222222222222222222222222222222222222222" as const;
const blockHash = `0x${"33".repeat(32)}` as const;
const description = "Latest Ethereum block height - current chain tip via eth_blockNumber";
const required = {
  x402Version: 2 as const,
  resource: { url: "https://api.onesource.io/api/chain/block-number", description },
  accepts: [{ scheme: "exact", network: "eip155:8453", amount: "1000",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    payTo: "0x52e29e0d2aa49bfbfc548c0a9f2196f4aa51f3ea", maxTimeoutSeconds: 3_600,
    extra: { credentialTypes: ["authorization"], name: "USD Coin", version: "2" } }],
  extensions: {},
};

describe("reference commerce proposal", () => {
  it("produces a verifier-accepted Base x402 purchase program", async () => {
    const manifest = productionCommerceMerchantManifestV1();
    const offer = normalizeX402ResourceV1({ paymentRequired: required,
      rawResponse: Buffer.from(JSON.stringify(required)), fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_300, sourceUrl: "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100",
      merchantId: "api.onesource.io", merchantDisplayName: "OneSource",
      manifestHash: commerceMerchantManifestCommitmentV1(manifest), productId: "block-number",
      productCommitment: manifest.entries[0]!.productCommitment,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
      merchantRegistered: true });
    const proposal = buildReferenceCommerceProposalV1({ offer, manifest, owner, executor,
      nowSec: 2_000_000_010, block: { number: 25_000_000n, hash: blockHash } });

    expect(proposal.policy).toMatchObject({ kind: "commerce-order", executionChainId: 8453,
      payment: { maxAtomic: "1000" } });
    await expect(verifyCommerceProgramV1({ ...proposal, offer, manifest, wallet: owner, executor,
      nowSec: 2_000_000_011, confirmAnchor: async () => true,
      readCodeHash: async () => manifest.entries[0]!.placement.kind === "x402-exact"
        ? manifest.entries[0]!.placement.token.runtimeCodeHash : blockHash,
      replay: async (compiled) => reproduceX402PlanV1(compiled),
    })).resolves.toMatchObject({ accepted: true, errorCodes: [] });
  });
});
