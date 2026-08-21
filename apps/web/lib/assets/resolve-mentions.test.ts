import { describe, expect, it, vi } from "vitest";
import type { SolverToolV1 } from "../solver-tools/types";
import type { XStocksToolValueV1 } from "../solver-tools/xstocks";
import { resolveAssetMentionsV1 } from "./resolve-mentions";

const aapl = {
  id: "03e9a31f-f889-4fdd-b45a-f2b30a3f824e",
  name: "Apple xStock",
  symbol: "AAPLx",
  isin: "CH1436219187",
  underlyingSymbol: "AAPL",
  underlyingIsin: "US0378331005",
  isTradingHalted: false,
  deployment: {
    address: "0x1111111111111111111111111111111111111111" as const,
    network: "XLayer" as const,
    supportsAtomicSwaps: true,
    stablecoins: [],
  },
};

function tool(value: XStocksToolValueV1): SolverToolV1<
  { operation: "get"; symbol: string } | { operation: "list"; page: number },
  XStocksToolValueV1
> {
  return { id: "rwa.instruments", version: 1, run: vi.fn().mockResolvedValue({
    status: "ok", sourceHash: `0x${"11".repeat(32)}`, fetchedAt: 2_000_000_000, value,
  }) };
}

describe("asset mention resolver", () => {
  it("resolves supported assets and registered instruments locally", async () => {
    const result = await resolveAssetMentionsV1(["USDG", "TSLAx"], tool({ assets: [] }));

    expect(result.assets).toEqual([
      expect.objectContaining({ symbol: "USDG", chainId: 196, status: "supported" }),
      expect.objectContaining({ symbol: "TSLAx", chainId: 196, status: "registered",
        address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0" }),
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("discovers other xStocks as exact research-only X Layer identities", async () => {
    const xstocks = tool({ assets: [aapl] });
    const result = await resolveAssetMentionsV1(["aaplx"], xstocks);

    expect(xstocks.run).toHaveBeenCalledWith({ operation: "get", symbol: "AAPLx" });
    expect(result.assets).toEqual([expect.objectContaining({
      symbol: "AAPLx", address: aapl.deployment.address,
      underlyingIdentifier: "US0378331005", status: "research-only",
    })]);
  });

  it("keeps arbitrary tickers unresolved instead of inventing contracts", async () => {
    const result = await resolveAssetMentionsV1(["FAKE", "../TSLAx"], tool({ assets: [] }));

    expect(result.assets).toEqual([]);
    expect(result.unresolved).toEqual(["FAKE", "../TSLAx"]);
  });
});
