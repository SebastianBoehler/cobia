import { describe, expect, it } from "vitest";
import type { StoredMarket } from "../db/markets";
import { latestMarketsByAsset, rankMarkets } from "./personalization";

const assetA = "0x1111111111111111111111111111111111111111";
const assetB = "0x2222222222222222222222222222222222222222";

function market(id: string, asset: `0x${string}`, apy: number): StoredMarket {
  return {
    id,
    requestId: id,
    policy: { asset } as StoredMarket["policy"],
    quotes: [{ expectedNetApyBps: apy } as StoredMarket["quotes"][number]],
    state: "quotes_ready",
    blockNumber: "1",
    createdAt: "2026-08-10T00:00:00.000Z",
    sourceApyBps: apy,
    protocols: ["Aave V3"],
    status: "current",
  };
}

describe("market personalization", () => {
  it("ranks markets supported by a held asset before a higher unsupported APY", () => {
    const funded = market("funded", assetA, 100);
    const unsupported = market("unsupported", assetB, 900);
    expect(rankMarkets([unsupported, funded], new Map([[assetA, 25]]))[0]?.id).toBe("funded");
  });

  it("collapses repeated competitions for the same asset into one market", () => {
    const groups = latestMarketsByAsset([market("new", assetA, 120), market("old", assetA, 90)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ market: { id: "new" }, roundCount: 2 });
  });
});
