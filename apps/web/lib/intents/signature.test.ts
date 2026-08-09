import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import {
  quoteSelectionCommitment,
  verifyPolicyOwnerSignature,
  verifyQuoteSelectionSignature,
} from "./signature";

const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const policy = {
  version: 1 as const,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: account.address,
  executionChainId: 196 as const,
  asset: USDG_ADDRESS,
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true as const,
};

describe("policy owner signature", () => {
  it("accepts only the owner signature over the exact commitment", async () => {
    const { commitment } = await import("@cobia/domain");
    const signature = await account.signMessage({ message: { raw: commitment(policy) } });
    await expect(verifyPolicyOwnerSignature(policy, signature)).resolves.toBeUndefined();
    await expect(
      verifyPolicyOwnerSignature({ ...policy, principalAtomic: "1" }, signature),
    ).rejects.toThrow("does not match owner");
  });

  it("binds quote selection authorization to the owner, request, and quote", async () => {
    const quoteId = `0x${"ab".repeat(32)}`;
    const signature = await account.signMessage({
      message: { raw: quoteSelectionCommitment(policy.requestId, quoteId) },
    });
    await expect(
      verifyQuoteSelectionSignature(policy.owner, policy.requestId, quoteId, signature),
    ).resolves.toBeUndefined();
    await expect(
      verifyQuoteSelectionSignature(policy.owner, crypto.randomUUID(), quoteId, signature),
    ).rejects.toThrow("does not match owner");
  });
});
