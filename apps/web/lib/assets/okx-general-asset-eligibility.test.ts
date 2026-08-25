import { describe, expect, it, vi } from "vitest";
import type { VerifyAssetEvidenceInput } from "@cobia/solvers";
import { createOkxGeneralAssetEligibilityV2 } from "./okx-general-asset-eligibility";

const token = "0x1111111111111111111111111111111111111111" as const;
const holder = "0x2222222222222222222222222222222222222222" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

function dependencies() {
  const nowSec = 2_000_000_000;
  const claimedIdentity = { runtimeCodeHash: hash("1"), proxy: { kind: "none" as const }, decimals: 18 };
  const reader: VerifyAssetEvidenceInput["reader"] = {
    latestBlockNumber: async () => 1_000n,
    blockHash: async () => hash("2"),
    runtimeCodeHash: async () => hash("1"),
    proxy: async () => ({ kind: "none" }),
    decimals: async () => 18,
  };
  return {
    nowSec: () => nowSec,
    market: { getTokenEvidence: vi.fn(async () => ({
      chainId: 1 as const, token, decimals: 18, priceUsd: "2.50" as string | undefined,
      liquidityUsd: "1000000" as string | undefined,
      marketDataAt: new Date(nowSec * 1_000).toISOString(),
      topHolderAddresses: [holder],
    })), getExecutableQuote: vi.fn(async () => ({ chainId: 1 as const,
      fromToken: token, toToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as const,
      inputAtomic: "1000000000000000000", outputAtomic: "2490000", outputDecimals: 6,
      priceImpactBps: 40, fetchedAt: new Date(nowSec * 1_000).toISOString(), route: ["uni"],
    })) },
    captureIdentity: vi.fn(async () => ({
      anchor: { blockNumber: "1000", blockHash: hash("2"), capturedAtSec: nowSec,
        expiresAtSec: nowSec + 60, maximumBlockAge: 8 }, claimedIdentity, reader,
    })),
    replayProbe: vi.fn(async () => ({
      transferReturn: "true" as const, transferFromReturn: "true" as const,
      approveReturn: "true" as const, transferAtomic: "1", senderDecreaseAtomic: "1",
      recipientIncreaseAtomic: "1", allowanceDecreaseAtomic: "1",
      approvalCleanupSucceeded: true, replayDeterministic: true,
      balancesStableWithoutTransfers: true, callbackCount: 0,
      blacklistOrPauseSurface: false, adminBalanceControlSurface: false,
    })),
  };
}

describe("OKX general asset eligibility", () => {
  it("derives exact input valuation and returns committed evidence", async () => {
    const deps = dependencies();
    const verifier = createOkxGeneralAssetEligibilityV2(deps);

    const result = await verifier.eligibility({ chainId: 1, token, inputAtomic: "1000000000000000000" });

    expect(result).toMatchObject({ status: "eligible" });
    if (result.status !== "eligible") throw new Error("Expected eligible asset");
    expect(result.valuationEvidence?.conservativeValueUsdE8).toBe("250000000");
    expect(result.identityHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.valuationHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deps.replayProbe).toHaveBeenCalledWith({ chainId: 1, token, source: holder,
      blockNumber: "1000", probeAtomic: "1" });
  });

  it("values the trusted X Layer reference token without requesting a self-swap", async () => {
    const deps = dependencies();
    const reference = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
    const nowSec = deps.nowSec();
    const reader: VerifyAssetEvidenceInput["reader"] = {
      latestBlockNumber: async () => 1_000n,
      blockHash: async () => hash("2"),
      runtimeCodeHash: async () => hash("1"),
      proxy: async () => ({ kind: "none" }),
      decimals: async () => 6,
    };
    deps.market.getTokenEvidence.mockResolvedValue({
      chainId: 196, token: reference, decimals: 6, priceUsd: "1", liquidityUsd: "1000000",
      marketDataAt: new Date(nowSec * 1_000).toISOString(), topHolderAddresses: [holder],
    } as never);
    deps.captureIdentity.mockResolvedValue({
      anchor: { blockNumber: "1000", blockHash: hash("2"), capturedAtSec: nowSec,
        expiresAtSec: nowSec + 60, maximumBlockAge: 8 },
      claimedIdentity: { runtimeCodeHash: hash("1"), proxy: { kind: "none" }, decimals: 6 }, reader,
    });

    const result = await createOkxGeneralAssetEligibilityV2(deps).eligibility({
      chainId: 196, token: reference, inputAtomic: "2000000",
    });

    expect(result).toMatchObject({ status: "eligible",
      valuationEvidence: { conservativeValueUsdE8: "200000000" } });
    expect(deps.market.getExecutableQuote).not.toHaveBeenCalled();
  });

  it("returns identity-only evidence for an output token", async () => {
    const deps = dependencies();
    deps.market.getTokenEvidence.mockResolvedValue({
      ...(await deps.market.getTokenEvidence()), liquidityUsd: undefined,
    });
    const result = await createOkxGeneralAssetEligibilityV2(deps)
      .eligibility({ chainId: 1, token });

    expect(result).toMatchObject({ status: "eligible" });
    expect("valuationHash" in result).toBe(false);
  });

  it("requires valuation metadata only when the token is spent", async () => {
    const deps = dependencies();
    deps.market.getTokenEvidence.mockResolvedValue({
      ...(await deps.market.getTokenEvidence()), priceUsd: undefined, liquidityUsd: undefined,
    });

    await expect(createOkxGeneralAssetEligibilityV2(deps).eligibility({
      chainId: 1, token, inputAtomic: "1000000000000000000",
    })).resolves.toEqual({
      status: "verification_pending",
      reason: "Authenticated OKX valuation metadata is unavailable.",
    });
  });

  it("fails closed for stale OKX evidence and unsupported behavior", async () => {
    const stale = dependencies();
    stale.market.getTokenEvidence.mockResolvedValue({
      ...(await stale.market.getTokenEvidence()),
      marketDataAt: new Date((stale.nowSec() - 121) * 1_000).toISOString(),
    });
    await expect(createOkxGeneralAssetEligibilityV2(stale).eligibility({ chainId: 1, token }))
      .resolves.toMatchObject({ status: "verification_pending", reason: expect.stringMatching(/stale/i) });

    const controlled = dependencies();
    controlled.replayProbe.mockResolvedValue({
      ...(await controlled.replayProbe()), blacklistOrPauseSurface: true,
    });
    await expect(createOkxGeneralAssetEligibilityV2(controlled).eligibility({ chainId: 1, token }))
      .resolves.toMatchObject({ status: "unsupported", reason: expect.stringMatching(/blacklist/i) });
  });

  it("fails closed when OKX liquidity is insufficient", async () => {
    const deps = dependencies();
    deps.market.getTokenEvidence.mockResolvedValue({
      ...(await deps.market.getTokenEvidence()), liquidityUsd: "99999.99",
    });
    await expect(createOkxGeneralAssetEligibilityV2(deps).eligibility({
      chainId: 1, token, inputAtomic: "1000000000000000000",
    })).resolves.toMatchObject({ status: "unsupported", reason: expect.stringMatching(/liquidity/i) });
  });
});
