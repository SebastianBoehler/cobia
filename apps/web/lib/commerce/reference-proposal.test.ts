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
const endpoint = "https://api.ethyai.app/paid/v1/xlayer/score/xlayer/0x779ded0c9e1022225f8e0630b35a9b54be713736";
const description = "Ethy Score (0-100) — composite token rating with component breakdown.";
const required = {
  x402Version: 2 as const,
  error: "Payment required",
  resource: { url: endpoint, description, mimeType: "" },
  accepts: [{ scheme: "exact", network: "eip155:196", amount: "100000",
    asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    payTo: "0xe8067e3c72f18054de14e4950480c093156130f8", maxTimeoutSeconds: 300,
    extra: { name: "USD₮0", version: "1" } }],
  extensions: {},
};

describe("reference commerce proposal", () => {
  it("produces a verifier-accepted X Layer x402 purchase program", async () => {
    const manifest = productionCommerceMerchantManifestV1();
    const offer = normalizeX402ResourceV1({ paymentRequired: required,
      rawResponse: Buffer.from(JSON.stringify(required)), fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_300, sourceUrl: endpoint,
      merchantId: "api.ethyai.app", merchantDisplayName: "Ethy AI",
      manifestHash: commerceMerchantManifestCommitmentV1(manifest), productId: "ethy-score",
      productCommitment: manifest.entries[0]!.productCommitment,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
      merchantRegistered: true });
    const proposal = buildReferenceCommerceProposalV1({ offer, manifest, owner, executor,
      nowSec: 2_000_000_010, block: { number: 25_000_000n, hash: blockHash } });

    expect(proposal.policy).toMatchObject({ kind: "commerce-order", executionChainId: 196,
      payment: { maxAtomic: "100000" } });
    await expect(verifyCommerceProgramV1({ ...proposal, offer, manifest, wallet: owner, executor,
      nowSec: 2_000_000_011, confirmAnchor: async () => true,
      readCodeHash: async () => manifest.entries[0]!.placement.kind === "x402-exact"
        ? manifest.entries[0]!.placement.token.runtimeCodeHash : blockHash,
      replay: async (compiled) => reproduceX402PlanV1(compiled),
    })).resolves.toMatchObject({ accepted: true, errorCodes: [] });
  });
});
