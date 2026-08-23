import { describe, expect, it } from "vitest";
import {
  verifyAssetEvidenceV1,
  type VerifyAssetEvidenceInput,
} from "../src/general-assets/rejections";

const token = "0x1111111111111111111111111111111111111111" as const;
const referenceToken = "0x2222222222222222222222222222222222222222" as const;
const implementation = "0x3333333333333333333333333333333333333333" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function validFixture(): VerifyAssetEvidenceInput {
  const identity = {
    runtimeCodeHash: hash("1"),
    proxy: {
      kind: "eip1967" as const,
      implementation,
      implementationRuntimeCodeHash: hash("2"),
      admin: null,
    },
    decimals: 18,
  };
  return {
    asset: { chainId: 196, token },
    anchor: {
      blockNumber: "1000",
      blockHash: hash("3"),
      capturedAtSec: 2_000_000_000,
      expiresAtSec: 2_000_000_120,
      maximumBlockAge: 8,
    },
    claimedIdentity: identity,
    reader: {
      latestBlockNumber: async () => 1_005n,
      blockHash: async () => hash("3"),
      runtimeCodeHash: async (_chainId, address) =>
        address === implementation ? hash("2") : hash("1"),
      proxy: async () => identity.proxy,
      decimals: async () => 18,
    },
    fork: {
      probePlainErc20: async () => ({
        transferReturn: "true",
        transferFromReturn: "true",
        approveReturn: "true",
        transferAtomic: "1000000000000000000",
        senderDecreaseAtomic: "1000000000000000000",
        recipientIncreaseAtomic: "1000000000000000000",
        allowanceDecreaseAtomic: "1000000000000000000",
        approvalCleanupSucceeded: true,
        replayDeterministic: true,
        balancesStableWithoutTransfers: true,
        callbackCount: 0,
        blacklistOrPauseSurface: false,
        adminBalanceControlSurface: false,
      }),
    },
    valuation: {
      asset: { chainId: 196, token },
      assetIdentityHash: hash("4"),
      inputAtomic: "1000000000000000000",
      referenceAsset: { chainId: 196, token: referenceToken },
      trustedReferenceAssets: [{ chainId: 196, token: referenceToken }],
      minimumLiquidityUsdE8: "100000000000",
      maximumDisagreementBps: 100,
      quotes: [
        {
          adapter: { id: "lifi.quote", version: 1 },
          outputAtomic: "1000000",
          referenceValueUsdE8: "100000000",
          liquidityUsdE8: "500000000000",
          priceImpactBps: 20,
          fetchedAtSec: 2_000_000_000,
          expiresAtSec: 2_000_000_120,
          quoteHash: hash("5"),
        },
        {
          adapter: { id: "okx.quote", version: 1 },
          outputAtomic: "1002000",
          referenceValueUsdE8: "100200000",
          liquidityUsdE8: "600000000000",
          priceImpactBps: 25,
          fetchedAtSec: 2_000_000_000,
          expiresAtSec: 2_000_000_120,
          quoteHash: hash("6"),
        },
      ],
    },
    nowSec: 2_000_000_010,
  };
}

async function codes(input: VerifyAssetEvidenceInput): Promise<readonly string[]> {
  return (await verifyAssetEvidenceV1(input)).errorCodes;
}

describe("general asset evidence", () => {
  it("accepts pinned plain ERC-20 identity and conservative executable valuation", async () => {
    const result = await verifyAssetEvidenceV1(validFixture());

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("Expected accepted evidence");
    expect(result.identityEvidence.token).toBe(token);
    expect(result.valuationEvidence.conservativeValueUsdE8).toBe("100200000");
  });

  it("rejects runtime and proxy implementation drift", async () => {
    const runtime = validFixture();
    runtime.reader.runtimeCodeHash = async () => hash("9");
    expect(await codes(runtime)).toContain("ASSET_RUNTIME_DRIFT");

    const proxy = validFixture();
    proxy.reader.proxy = async () => ({
      ...proxy.claimedIdentity.proxy,
      implementationRuntimeCodeHash: hash("9"),
    });
    expect(await codes(proxy)).toContain("ASSET_IMPLEMENTATION_DRIFT");

    const admin = validFixture();
    admin.reader.proxy = async () => ({
      ...admin.claimedIdentity.proxy,
      admin: "0x5555555555555555555555555555555555555555",
    });
    expect(await codes(admin)).toContain("ASSET_PROXY_DRIFT");
  });

  it.each(["false", "none"] as const)("rejects %s-return transfers", async (returnKind) => {
    const input = validFixture();
    input.fork.probePlainErc20 = async () => ({
      ...(await validFixture().fork.probePlainErc20(input.asset, input.anchor)),
      transferReturn: returnKind,
    });
    expect(await codes(input)).toContain("ASSET_TRANSFER_RETURN_UNSUPPORTED");
  });

  it("rejects transfer fees, rebasing, callbacks, and privileged controls", async () => {
    const mutations = [
      ["recipientIncreaseAtomic", "999999999999999999", "ASSET_TRANSFER_FEE_UNSUPPORTED"],
      ["balancesStableWithoutTransfers", false, "ASSET_REBASING_UNSUPPORTED"],
      ["callbackCount", 1, "ASSET_CALLBACK_UNSUPPORTED"],
      ["blacklistOrPauseSurface", true, "ASSET_BLACKLIST_CONTROL_UNSUPPORTED"],
      ["adminBalanceControlSurface", true, "ASSET_ADMIN_BALANCE_CONTROL_UNSUPPORTED"],
    ] as const;

    for (const [field, value, error] of mutations) {
      const input = validFixture();
      input.fork.probePlainErc20 = async () => ({
        ...(await validFixture().fork.probePlainErc20(input.asset, input.anchor)),
        [field]: value,
      });
      expect(await codes(input)).toContain(error);
    }
  });

  it("rejects invalid decimals and stale or shallow pinned evidence", async () => {
    const decimals = validFixture();
    decimals.reader.decimals = async () => 37;
    expect(await codes(decimals)).toContain("ASSET_DECIMALS_UNSUPPORTED");

    const staleBlock = validFixture();
    staleBlock.reader.latestBlockNumber = async () => 1_009n;
    expect(await codes(staleBlock)).toContain("ASSET_BLOCK_STALE");

    const expired = validFixture();
    expired.nowSec = expired.anchor.expiresAtSec;
    expect(await codes(expired)).toContain("ASSET_EVIDENCE_EXPIRED");
  });

  it("rejects shallow, expired, disagreeing, or untrusted-reference quotes", async () => {
    const shallow = validFixture();
    shallow.valuation.quotes[0]!.liquidityUsdE8 = "99999999999";
    expect(await codes(shallow)).toContain("VALUATION_LIQUIDITY_INSUFFICIENT");

    const expired = validFixture();
    expired.valuation.quotes[0]!.expiresAtSec = expired.nowSec;
    expect(await codes(expired)).toContain("VALUATION_QUOTE_EXPIRED");

    const disagreement = validFixture();
    disagreement.valuation.quotes[1]!.referenceValueUsdE8 = "120000000";
    expect(await codes(disagreement)).toContain("VALUATION_PRICE_DISAGREEMENT");

    const untrusted = validFixture();
    untrusted.valuation.trustedReferenceAssets = [];
    expect(await codes(untrusted)).toContain("VALUATION_REFERENCE_UNTRUSTED");
  });

  it("never uses ticker symbols to establish asset identity", async () => {
    const first = validFixture();
    const collision = validFixture();
    collision.asset = { chainId: 196, token: "0x4444444444444444444444444444444444444444" };

    expect(first.asset).not.toEqual(collision.asset);
    expect(await codes(collision)).toContain("VALUATION_ASSET_MISMATCH");
  });
});
