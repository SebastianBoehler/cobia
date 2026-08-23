import { describe, expect, it, vi } from "vitest";
import { resolveXStockIntentRequestV1 } from "./xstock-intent-request";

const AAPLX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USDG = "0x2222222222222222222222222222222222222222";

describe("xStocks intent request resolution", () => {
  it("resolves a non-Tesla xStock into exact X Layer atomic bounds", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "ok",
      sourceHash: `0x${"11".repeat(32)}`,
      fetchedAt: 2_000_000_000,
      value: { assets: [{
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Apple xStock",
        symbol: "AAPLx",
        isin: "CH1436218626",
        underlyingSymbol: "AAPL",
        underlyingIsin: "US0378331005",
        isTradingHalted: false,
        deployment: {
          address: AAPLX,
          network: "XLayer",
          supportsAtomicSwaps: true,
          stablecoins: [{ symbol: "USDG", address: USDG, decimals: 6,
            issuance: true, redemption: true, supportsAtomicSwaps: true }],
        },
      }] },
    });

    await expect(resolveXStockIntentRequestV1({
      goal: "Acquire at least 0.25 @aaplx with at most 50 @USDG on @XLayer",
      tool: { run },
      usdgAddress: USDG,
    })).resolves.toEqual({
      status: "resolved",
      sourceHash: `0x${"11".repeat(32)}`,
      symbol: "AAPLx",
      input: { chainId: 196, address: USDG, maximumAtomic: "50000000" },
      output: { chainId: 196, address: AAPLX, minimumAtomic: "250000000000000000" },
    });
    expect(run).toHaveBeenCalledWith({ operation: "get", symbol: "AAPLx" });
  });
});
