import { describe, expect, it, vi } from "vitest";
import { createPendleXLayerToolV1 } from "./pendle-xlayer";

const market = {
  name: "USDG",
  protocol: "Global Dollar",
  address: "0xcfb506cb34dd340e80d3df8764182a5187636032",
  expiry: "2026-10-29T00:00:00.000Z",
  pt: "196-0x9a09a9e491db3dd8ada5b1b889991ac9ad5fd362",
  yt: "196-0x5e67c8d19eea0fd0d0da35e4008b56e87c931724",
  sy: "196-0x1f336f899f77b084133bc14a81170837ed618d1b",
  underlyingAsset: "196-0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  chainId: 196,
  details: { liquidity: 6_081_347.51, totalTvl: 6_084_251.64, underlyingApy: 0.033, impliedApy: 0.0321, aggregatedApy: 0.0841 },
};

describe("Pendle X Layer solver tool", () => {
  it("returns bounded, hashed X Layer market discovery without wallet authority", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ total: 1, results: [market] }));
    const tool = createPendleXLayerToolV1({ fetcher, now: () => 2_000_000_000_000 });

    const result = await tool.run({ operation: "list" });

    expect(result).toMatchObject({
      status: "ok", fetchedAt: 2_000_000_000,
      value: { markets: [{ name: "USDG", protocol: "Global Dollar", expiry: market.expiry,
        market: market.address, pt: "0x9a09a9e491db3dd8ada5b1b889991ac9ad5fd362",
        impliedApy: 0.0321, aggregatedApy: 0.0841 }] },
    });
    expect(result).toHaveProperty("sourceHash", expect.stringMatching(/^0x[0-9a-f]{64}$/));
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-v2.pendle.finance/core/v2/markets/all?chainId=196&limit=100&skip=0",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    expect(JSON.stringify(result)).not.toMatch(/wallet|privateKey|sign|sendTransaction|rpcUrl/i);
  });

  it("abstains when Pendle does not provide valid X Layer market evidence", async () => {
    const tool = createPendleXLayerToolV1({
      fetcher: vi.fn().mockResolvedValue(Response.json({ total: 1, results: [{ ...market, chainId: 1 }] })),
    });

    await expect(tool.run({ operation: "list" })).resolves.toMatchObject({
      status: "abstained", code: "PENDLE_XLAYER_UNAVAILABLE",
    });
  });
});
