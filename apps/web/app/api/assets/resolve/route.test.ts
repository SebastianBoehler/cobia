import { describe, expect, it, vi } from "vitest";
import { POST, resolveAssetMentionRequest, type AssetResolution } from "./route";
import { createTtlAsyncCache } from "../../../../lib/cache/ttl-async-cache";
import type { XStocksInstrumentV1 } from "../../../../lib/solver-tools/xstocks";

const xstocks = {
  id: "rwa.instruments" as const,
  version: 1 as const,
  run: vi.fn().mockResolvedValue({ status: "abstained", code: "NOT_FOUND", message: "Not found" }),
};

describe("POST /api/assets/resolve", () => {
  it("returns exact known identities and explicit unresolved mentions", async () => {
    const response = await resolveAssetMentionRequest(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: ["USDG", "FAKE"] }),
    }), xstocks);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      assets: [{ symbol: "USDG", chainId: 196, status: "supported" }],
      unresolved: ["FAKE"],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects oversized or malformed resolution requests", async () => {
    const response = await POST(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: Array.from({ length: 9 }, (_, index) => `T${index}`) }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "ASSET_RESOLUTION_INVALID" });
  });

  it("returns exact OKX contract and price evidence for research-only tokens", async () => {
    const token = "0x2222222222222222222222222222222222222222" as const;
    const okx = { searchXLayerToken: vi.fn(async () => ({ chainId: 196 as const, token,
      name: "Example Token", symbol: "EXAMPLE", decimals: 18, priceUsd: "2.50",
      liquidityUsd: "100000", holderCount: "1200" })) };
    const response = await resolveAssetMentionRequest(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: ["EXAMPLE"] }),
    }), xstocks, okx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ assets: [{ symbol: "EXAMPLE",
      address: token, priceUsd: "2.50", liquidityUsd: "100000", holderCount: "1200" }] });
  });

  it("searches the full xStocks catalog and X Layer market for autocomplete candidates", async () => {
    const xstock = {
      id: "rwa.instruments" as const, version: 1 as const,
      run: vi.fn().mockResolvedValue({ status: "ok" as const, sourceHash: `0x${"11".repeat(32)}`,
        fetchedAt: 2_000_000_000, value: { assets: [{
          id: "96f43a87-976b-4076-ac84-394966c32a90", name: "Tesla xStock", symbol: "TSLAx",
          isin: "CH1436219252", underlyingSymbol: "TSLA", underlyingIsin: "US88160R1014",
          isTradingHalted: false, deployment: { address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
            network: "XLayer" as const, supportsAtomicSwaps: true, stablecoins: [{ symbol: "USDG",
              address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6,
              issuance: true, redemption: true, supportsAtomicSwaps: true }] },
        }], page: 0, hasNextPage: false } }),
    };
    const token = "0x2222222222222222222222222222222222222222" as const;
    const okx = { searchXLayerTokens: vi.fn(async () => [{ chainId: 196 as const, token,
      name: "Test Token", symbol: "TEST", decimals: 18, priceUsd: "2.50", liquidityUsd: "100000" }]) };
    const cache = createTtlAsyncCache<AssetResolution>({ ttlMs: 60_000, maxEntries: 8 });
    const catalog = createTtlAsyncCache<XStocksInstrumentV1[]>({ ttlMs: 60_000, maxEntries: 1 });
    const response = await resolveAssetMentionRequest(new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "tes" }),
    }), xstock, okx, cache, undefined, catalog);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ assets: expect.arrayContaining([
      expect.objectContaining({ symbol: "TSLAx", status: "catalog-backed" }),
      expect.objectContaining({ symbol: "TEST", address: token }),
    ]) });
    expect(xstock.run).toHaveBeenCalledWith({ operation: "list", page: 0 });
  });

  it("reuses fresh resolution evidence for repeated requests", async () => {
    const token = "0x2222222222222222222222222222222222222222" as const;
    const okx = { searchXLayerToken: vi.fn(async () => ({ chainId: 196 as const, token,
      name: "Example Token", symbol: "EXAMPLE", decimals: 18, priceUsd: "2.50",
      liquidityUsd: "100000", holderCount: "1200" })) };
    const cache = createTtlAsyncCache<AssetResolution>({ ttlMs: 60_000, maxEntries: 8 });
    const request = () => new Request("https://getcobia.com/api/assets/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols: ["EXAMPLE"] }),
    });

    await resolveAssetMentionRequest(request(), xstocks, okx, cache);
    await resolveAssetMentionRequest(request(), xstocks, okx, cache);

    expect(okx.searchXLayerToken).toHaveBeenCalledTimes(1);
  });

  it("resolves an exact Ethereum contract without substituting by symbol", async () => {
    const token = "0x2222222222222222222222222222222222222222" as const;
    const identityHash = `0x${"33".repeat(32)}` as const;
    const valuationHash = `0x${"44".repeat(32)}` as const;
    const okx = {
      searchToken: vi.fn(async () => ({ chainId: 1 as const, token,
        name: "Random Token", symbol: "RND", decimals: 18,
        priceUsd: "2", liquidityUsd: "200000" })),
      searchXLayerToken: vi.fn(),
    };
    const verifier = { eligibility: vi.fn(async () => ({ status: "eligible" as const,
      identityHash, valuationHash })) };
    const response = await resolveAssetMentionRequest(new Request(
      "https://getcobia.com/api/assets/resolve",
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: [{ chainId: 1, address: token, maximumAtomic: "1000" }] }) },
    ), xstocks, okx, undefined, verifier);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ assets: [{
      chainId: 1, address: token, status: "eligible", identityHash, valuationHash,
    }] });
    expect(okx.searchToken).toHaveBeenCalledWith(1, token);
    expect(verifier.eligibility).toHaveBeenCalledWith({ chainId: 1, token, inputAtomic: "1000" });
    expect(okx.searchXLayerToken).not.toHaveBeenCalled();
  });

  it("rejects selectors that omit an exact chain or identity", async () => {
    const response = await resolveAssetMentionRequest(new Request(
      "https://getcobia.com/api/assets/resolve",
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: [{ symbol: "RND" }] }) },
    ), xstocks);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "ASSET_RESOLUTION_INVALID" });
  });
});
