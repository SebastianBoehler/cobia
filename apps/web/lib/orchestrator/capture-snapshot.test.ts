import type { StablecoinPolicy } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import type { OkxClient, RawProductDetail } from "../okx/client";
import { AAVE_V3_POOL, USDG_ADDRESS } from "../chain/xlayer";
import { captureSnapshot } from "./capture-snapshot";

const policy: StablecoinPolicy = {
  version: 1,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset: USDG_ADDRESS,
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
};

const detail: RawProductDetail = {
  investmentId: "9001",
  investmentName: "USDG",
  platformName: "Aave V3",
  chainIndex: "196",
  rate: "0.0642",
  tvl: "500000000.25",
  isInvestable: true,
  utilizationRate: "0.72",
  underlyingToken: [
    {
      tokenSymbol: "USDG",
      tokenAddress: USDG_ADDRESS,
      chainIndex: "196",
      tokenPrecision: 6,
    },
  ],
};

function dependencies(endBlock = 1_002n) {
  let reads = 0;
  return {
    okx: {
      searchProducts: vi.fn().mockResolvedValue([
        {
          investmentId: "9001",
          name: "USDG",
          platformName: "Aave V3",
          rate: "0.0642",
          tvl: "500000000.25",
          productGroup: "LENDING",
          chainIndex: "196",
        },
      ]),
      getProductDetail: vi.fn().mockResolvedValue(detail),
    } as Pick<OkxClient, "searchProducts" | "getProductDetail">,
    blocks: {
      getLatestBlock: vi.fn().mockImplementation(async () => {
        const number = reads++ === 0 ? 1_000n : endBlock;
        return { number, hash: `0x${"ab".repeat(32)}` as const };
      }),
    },
    now: () => new Date("2026-08-09T10:00:00.000Z"),
  };
}

describe("captureSnapshot", () => {
  it("captures one immutable block-bounded USDG market snapshot", async () => {
    const deps = dependencies();

    await expect(captureSnapshot(policy, deps)).resolves.toEqual({
      version: 1,
      requestId: policy.requestId,
      chainId: 196,
      blockNumber: "1000",
      blockHash: `0x${"ab".repeat(32)}`,
      capturedAt: "2026-08-09T10:00:00.000Z",
      asset: { address: USDG_ADDRESS, symbol: "USDG", decimals: 6 },
      candidates: [
        {
          id: "cash:usdg",
          kind: "cash",
          apyBps: 0,
          tvlUsdE6: "0",
          retrievedAt: "2026-08-09T10:00:00.000Z",
        },
        {
          id: "aave-v3:9001",
          kind: "aave-v3",
          investmentId: "9001",
          poolAddress: AAVE_V3_POOL,
          apyBps: 642,
          tvlUsdE6: "500000000250000",
          utilizationBps: 7_200,
          retrievedAt: "2026-08-09T10:00:00.000Z",
        },
      ],
    });
    expect(deps.okx.searchProducts).toHaveBeenCalledWith({
      tokenKeywordList: ["USDG"],
      platformKeywordList: ["AAVE V3"],
      chainIndex: "196",
      productGroup: "LENDING",
      pageNum: 1,
    });
    expect(Object.isFrozen((await captureSnapshot(policy, dependencies())).candidates)).toBe(true);
  });

  it("rejects data collected across more than five blocks", async () => {
    await expect(captureSnapshot(policy, dependencies(1_006n))).rejects.toThrow(
      "more than five blocks",
    );
  });

  it("rejects a product whose underlying token differs from policy", async () => {
    const deps = dependencies();
    vi.mocked(deps.okx.getProductDetail).mockResolvedValue({
      ...detail,
      underlyingToken: [
        { ...detail.underlyingToken[0], tokenAddress: "0x3333333333333333333333333333333333333333" },
      ],
    });

    await expect(captureSnapshot(policy, deps)).rejects.toThrow(
      "does not match policy asset",
    );
  });
});
