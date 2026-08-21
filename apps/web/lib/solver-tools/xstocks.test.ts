import { describe, expect, it, vi } from "vitest";
import { createXStocksInstrumentToolV1 } from "./xstocks";

const tesla = {
  id: "96f43a87-976b-4076-ac84-394966c32a90",
  name: "Tesla xStock",
  symbol: "TSLAx",
  isin: "CH1436219252",
  underlyingSymbol: "TSLA",
  underlyingIsin: "US88160R1014",
  isTradingHalted: false,
  deployments: [{
    address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
    network: "XLayer",
    wrapperAddressV2: "0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171",
    supportsAtomicSwaps: true,
    stablecoins: [{
      symbol: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
      decimals: 6, issuance: true, redemption: true, supportsAtomicSwaps: true,
    }],
  }],
};

describe("xStocks instrument solver tool", () => {
  it("resolves an exact issuer asset to its X Layer contract identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(tesla));
    const tool = createXStocksInstrumentToolV1({ fetcher, now: () => 2_000_000_000_000 });

    const result = await tool.run({ operation: "get", symbol: "TSLAx" });

    expect(result).toMatchObject({
      status: "ok", fetchedAt: 2_000_000_000,
      value: { assets: [{
        symbol: "TSLAx", underlyingIsin: "US88160R1014",
        deployment: { network: "XLayer", address: tesla.deployments[0]!.address },
      }] },
    });
    expect(result).toHaveProperty("sourceHash", expect.stringMatching(/^0x[0-9a-f]{64}$/));
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.xstocks.fi/api/v2/public/assets/TSLAx",
      expect.objectContaining({ redirect: "error" }),
    );
    expect(JSON.stringify(result)).not.toMatch(/wallet|privateKey|sign|sendTransaction|rpcUrl/i);
  });

  it("lists only assets with an X Layer deployment", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      nodes: [tesla, { ...tesla, symbol: "SOLONLYx", deployments: [] }],
      page: { currentPage: 3, hasNextPage: true },
    }));
    const tool = createXStocksInstrumentToolV1({ fetcher });

    await expect(tool.run({ operation: "list", page: 3 })).resolves.toMatchObject({
      status: "ok", value: { assets: [{ symbol: "TSLAx" }], page: 3, hasNextPage: true },
    });
  });

  it("fails closed on unsupported symbols and upstream data", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not json", {
      headers: { "content-type": "text/plain" },
    }));
    const tool = createXStocksInstrumentToolV1({ fetcher });

    await expect(tool.run({ operation: "get", symbol: "../TSLAx" })).resolves.toMatchObject({
      status: "abstained", code: "XSTOCKS_REQUEST_INVALID",
    });
    await expect(tool.run({ operation: "get", symbol: "TSLAx" })).resolves.toMatchObject({
      status: "abstained", code: "XSTOCKS_UNAVAILABLE",
    });
  });
});
