import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import {
  quoteSelectionCommitment,
  routeAccessCommitment,
  verifyPolicyOwnerSignature,
  verifyQuoteSelectionSignature,
  verifyRouteAccessSignature,
} from "./signature";

const account = privateKeyToAccount(keccak256(toHex("cobia-intent-test-signer")));

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

  it("verifies route access as the raw commitment signed by the buyer", async () => {
    const routeId = `0x${"cd".repeat(32)}`;
    const timestamp = 1_786_391_000;
    const signature = await account.signMessage({
      message: { raw: routeAccessCommitment(routeId, account.address, timestamp) },
    });
    await expect(
      verifyRouteAccessSignature(account.address, routeId, timestamp, signature),
    ).resolves.toBeUndefined();
    await expect(
      verifyRouteAccessSignature(account.address, routeId, timestamp + 1, signature),
    ).rejects.toThrow("does not match buyer");
  });
});
