import { describe, expect, it, vi } from "vitest";
import type { SolverToolV1 } from "../solver-tools/types";
import type { XStocksToolValueV1 } from "../solver-tools/xstocks";
import { resolveAssetMentionsV1, resolveAssetSelectorsV2 } from "./resolve-mentions";

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
    stablecoins: [{ symbol: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const,
      decimals: 6, issuance: true, redemption: true, supportsAtomicSwaps: true }],
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

  it("adds a supported asset price only when OKX returns its canonical contract", async () => {
    const canonical = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8" as const;
    const okx = { searchXLayerToken: vi.fn(async () => ({ chainId: 196 as const, token: canonical,
      name: "USDG", symbol: "USDG", decimals: 6, priceUsd: "0.9998",
      liquidityUsd: "2500000", holderCount: "4200" })) };

    const result = await resolveAssetMentionsV1(["USDG"], tool({ assets: [] }), okx);

    expect(result.assets[0]).toMatchObject({ symbol: "USDG", address: canonical, priceUsd: "0.9998" });

    const mismatchedOkx = { searchXLayerToken: vi.fn(async () => ({ chainId: 196 as const,
      token: "0x1111111111111111111111111111111111111111" as const,
      name: "USDG", symbol: "USDG", decimals: 6, priceUsd: "9.99",
      liquidityUsd: "1", holderCount: "1" })) };
    const mismatch = await resolveAssetMentionsV1(["USDG"], tool({ assets: [] }), mismatchedOkx);
    expect(mismatch.assets[0]?.priceUsd).toBeUndefined();
  });

  it("queries USDt0 by its canonical USDT market symbol", async () => {
    const canonical = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
    const okx = { searchXLayerToken: vi.fn(async (symbol: string) => symbol === "USDT"
      ? { chainId: 196 as const, token: canonical, name: "Tether USD", symbol: "USDT",
        decimals: 6, priceUsd: "0.9999", liquidityUsd: "2500000", holderCount: "4200" }
      : undefined) };

    const result = await resolveAssetMentionsV1(["USDt0"], tool({ assets: [] }), okx);

    expect(okx.searchXLayerToken).toHaveBeenCalledWith("USDT");
    expect(result.assets[0]).toMatchObject({
      symbol: "USDt0", priceUsd: "0.9999",
    });
    expect(result.assets[0]?.address.toLowerCase()).toBe(canonical);
  });

  it("discovers any atomically routable xStock as a catalog-backed X Layer identity", async () => {
    const xstocks = tool({ assets: [aapl] });
    const result = await resolveAssetMentionsV1(["aaplx"], xstocks);

    expect(xstocks.run).toHaveBeenCalledWith({ operation: "get", symbol: "AAPLx" });
    expect(result.assets).toEqual([expect.objectContaining({
      symbol: "AAPLx", address: aapl.deployment.address,
      underlyingIdentifier: "US0378331005", status: "catalog-backed",
    })]);
  });

  it("keeps arbitrary tickers unresolved instead of inventing contracts", async () => {
    const result = await resolveAssetMentionsV1(["FAKE", "../TSLAx"], tool({ assets: [] }));

    expect(result.assets).toEqual([]);
    expect(result.unresolved).toEqual(["FAKE", "../TSLAx"]);
  });

  it("resolves one exact OKX X Layer token as priced research evidence", async () => {
    const token = "0x2222222222222222222222222222222222222222" as const;
    const okx = { searchXLayerToken: vi.fn(async () => ({ chainId: 196 as const, token,
      name: "Example Token", symbol: "EXAMPLE", decimals: 18, priceUsd: "2.50",
      liquidityUsd: "100000", holderCount: "1200" })) };

    const result = await resolveAssetMentionsV1(["example"], tool({ assets: [] }), okx);

    expect(okx.searchXLayerToken).toHaveBeenCalledWith("example");
    expect(result.assets).toEqual([{ symbol: "EXAMPLE", name: "Example Token", chainId: 196,
      address: token, status: "research-only", priceUsd: "2.50",
      liquidityUsd: "100000", holderCount: "1200" }]);
    expect(result.unresolved).toEqual([]);
  });
});

describe("general asset selector resolution", () => {
  const token = "0x2222222222222222222222222222222222222222" as const;
  const identityHash = `0x${"44".repeat(32)}` as const;
  const valuationHash = `0x${"55".repeat(32)}` as const;

  it("selects a random token by exact chain and address and exposes verifier status", async () => {
    const lookup = { searchToken: vi.fn(async () => ({ chainId: 1 as const, token,
      name: "Random Dollar", symbol: "USD", decimals: 18, priceUsd: "1.01",
      liquidityUsd: "200000", holderCount: "900" })) };
    const verifier = { eligibility: vi.fn(async () => ({ status: "eligible" as const,
      identityHash, valuationHash })) };

    const result = await resolveAssetSelectorsV2(
      [{ chainId: 1, address: token, maximumAtomic: "1000" }], tool({ assets: [] }), lookup, verifier,
    );

    expect(lookup.searchToken).toHaveBeenCalledWith(1, token);
    expect(result.assets).toEqual([expect.objectContaining({
      chainId: 1, address: token, symbol: "USD", status: "eligible",
      identityHash, valuationHash,
    })]);
    expect(verifier.eligibility).toHaveBeenCalledWith({ chainId: 1, token, inputAtomic: "1000" });
  });

  it("does not pick one of two same-symbol contracts", async () => {
    const ambiguous = Object.assign(new Error("ambiguous"), { code: "AMBIGUOUS_TOKEN" });
    const lookup = { searchToken: vi.fn().mockRejectedValue(ambiguous) };

    const result = await resolveAssetSelectorsV2(
      [{ chainId: 196, symbol: "USD" }], tool({ assets: [] }), lookup,
    );

    expect(result).toMatchObject({
      assets: [], unresolved: [], ambiguities: [{ chainId: 196, symbol: "USD" }],
    });
  });

  it("keeps metadata-only tokens pending and preserves unsupported reasons", async () => {
    const lookup = { searchToken: vi.fn(async () => ({ chainId: 196 as const, token,
      name: "Fee Token", symbol: "FEE", decimals: 9, priceUsd: "0.4",
      liquidityUsd: "1000" })) };
    const pending = await resolveAssetSelectorsV2(
      [{ chainId: 196, address: token }], tool({ assets: [] }), lookup,
    );
    expect(pending.assets[0]).toMatchObject({
      status: "verification_pending", reason: "Independent asset verification has not completed.",
    });

    const verifier = { eligibility: vi.fn(async () => ({ status: "unsupported" as const,
      reason: "Fee-on-transfer behavior is unsupported." })) };
    const unsupported = await resolveAssetSelectorsV2(
      [{ chainId: 196, address: token }], tool({ assets: [] }), lookup, verifier,
    );
    expect(unsupported.assets[0]).toMatchObject({
      status: "unsupported", reason: "Fee-on-transfer behavior is unsupported.",
    });
  });
});
