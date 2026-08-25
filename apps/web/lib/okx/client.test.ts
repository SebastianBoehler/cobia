import { describe, expect, it, vi } from "vitest";
import { signOkxRequest } from "./auth";
import { createOkxClient } from "./client";

const credentials = {
  apiKey: "key",
  secretKey: "secret",
  passphrase: "pass",
};

describe("OKX request authentication", () => {
  it("signs the exact timestamp, method, path, and serialized body", () => {
    const body = '{"tokenKeywordList":["USDC"],"chainIndex":"196"}';

    expect(
      signOkxRequest({
        timestamp: "2026-08-10T10:00:00.000Z",
        method: "POST",
        path: "/api/v6/defi/product/search",
        body,
        ...credentials,
      }),
    ).toEqual({
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": "key",
      "OK-ACCESS-PASSPHRASE": "pass",
      "OK-ACCESS-SIGN": "al2i0unOZ+01HKvPWF36yEbL+49c+FZhGs6hnnmtEsw=",
      "OK-ACCESS-TIMESTAMP": "2026-08-10T10:00:00.000Z",
    });
  });
});

describe("OKX DeFi client", () => {
  it("returns exact native OKB identity and observed market data", async () => {
    const native = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
      code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: native, tokenName: "OKB",
        tokenSymbol: "OKB", decimal: "18", tagList: {}, price: "110.25",
        liquidity: "15000000", holders: "",
      }],
    }));
    const client = createOkxClient({ credentials, fetchImpl,
      now: () => new Date("2026-08-23T08:00:00.000Z") });

    await expect(client.getXLayerNativeTokenEvidence()).resolves.toEqual({
      assetType: "native", chainId: 196, token: native, name: "OKB", symbol: "OKB",
      decimals: 18, priceUsd: "110.25", liquidityUsd: "15000000",
      marketDataAt: "2026-08-23T08:00:00.000Z",
    });
  });

  it("sends the same body it signs and parses product search", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "",
          data: {
            total: 1,
            list: [
              {
                investmentId: 9001,
                name: "USDC",
                platformName: "Aave V3 / Main Market",
                rate: "0.0642",
                tvl: "500000000",
                productGroup: null,
                chainIndex: "196",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const client = createOkxClient({
      credentials,
      fetchImpl,
      now: () => new Date("2026-08-10T10:00:00.000Z"),
    });

    await expect(
      client.searchProducts({
        tokenKeywordList: ["USDC"],
        platformKeywordList: ["AAVE V3"],
        chainIndex: "196",
        productGroup: "LENDING",
        pageNum: 1,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        investmentId: "9001",
        platformName: "Aave V3 / Main Market",
        chainIndex: "196",
      }),
    ]);

    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.body).toBe(
      '{"tokenKeywordList":["USDC"],"platformKeywordList":["AAVE V3"],"chainIndex":"196","productGroup":"LENDING","pageNum":1}',
    );
    expect(new Headers(init?.headers).get("OK-ACCESS-TIMESTAMP")).toBe(
      "2026-08-10T10:00:00.000Z",
    );
  });

  it("rejects OKX business errors even when HTTP succeeds", async () => {
    const client = createOkxClient({
      credentials,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ code: "50011", msg: "Rate limit", data: null }),
      ),
    });

    await expect(
      client.searchProducts({
        tokenKeywordList: ["USDC"],
        chainIndex: "196",
      }),
    ).rejects.toMatchObject({
      name: "OkxApiError",
      code: "50011",
    });
  });

  it("rejects malformed successful payloads", async () => {
    const client = createOkxClient({
      credentials,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ code: "0", msg: "", data: { list: [{}] } }),
      ),
    });

    await expect(
      client.searchProducts({
        tokenKeywordList: ["USDC"],
        chainIndex: "196",
      }),
    ).rejects.toThrow("Invalid OKX product response");
  });

  it("signs the product-detail query path and parses execution metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: "0",
        msg: "",
        data: {
          investmentId: 9001,
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
              tokenAddress: "0x1111111111111111111111111111111111111111",
              isBaseToken: false,
            },
          ],
        },
      }),
    );
    const client = createOkxClient({
      credentials,
      fetchImpl,
      now: () => new Date("2026-08-10T10:00:00.000Z"),
    });

    await expect(client.getProductDetail("9001")).resolves.toMatchObject({
      investmentId: "9001",
      investmentName: "USDG",
      isInvestable: true,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://web3.okx.com/api/v6/defi/product/detail?investmentId=9001",
    );
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
  });
});

describe("OKX Market client", () => {
  it("lists non-risk X Layer wallet token contracts", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "0", msg: "", data: [{
      tokenAssets: [
        { chainIndex: "196", tokenContractAddress: "", symbol: "OKB", balance: "0.01",
          tokenPrice: "107.41", isRiskToken: false },
        { chainIndex: "196", tokenContractAddress: token, symbol: "EXAMPLE", balance: "2.5",
          tokenPrice: "1.25", isRiskToken: false },
        { chainIndex: "196", tokenContractAddress: "0x2222222222222222222222222222222222222222",
          symbol: "RISK", balance: "1", tokenPrice: "1", isRiskToken: true },
      ],
    }] }));
    const client = createOkxClient({ credentials, fetchImpl,
      now: () => new Date("2026-08-22T18:00:00.000Z") });

    await expect(client.listXLayerTokenBalances("0x3333333333333333333333333333333333333333"))
      .resolves.toEqual([{ chainId: 196, token, symbol: "EXAMPLE", balance: "2.5", priceUsd: "1.25" }]);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://web3.okx.com/api/v6/dex/balance/all-token-balances-by-address?address=0x3333333333333333333333333333333333333333&chains=196",
    );
  });

  it("resolves native OKB when OKX omits its holder count", async () => {
    const token = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const client = createOkxClient({ credentials, fetchImpl: vi.fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: token, tokenName: "X Layer",
        tokenSymbol: "OKB", decimal: "18", price: "107.41",
        liquidity: "86589137.50", holders: "", tagList: { communityRecognized: true },
      }] })) });

    await expect(client.searchXLayerToken("OKB")).resolves.toEqual({
      chainId: 196, token, name: "X Layer", symbol: "OKB", decimals: 18,
      priceUsd: "107.41", liquidityUsd: "86589137.50", holderCount: undefined,
    });
  });

  it("resolves a registered Ethereum token with exact chain identity", async () => {
    const token = "0x96f6ef951840721adbf46ac996b59e0235cb985c";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: "0", msg: "", data: [{ chainIndex: "1", tokenContractAddress: token,
        tokenName: "Ondo US Dollar Yield", tokenSymbol: "USDY", decimal: "18",
        price: "1.15", liquidity: "73894", holders: "1200", tagList: {} }],
    }));
    const client = createOkxClient({ credentials, fetchImpl });

    await expect(client.searchToken(1, "USDY")).resolves.toMatchObject({
      chainId: 1, token, symbol: "USDY", priceUsd: "1.15",
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://web3.okx.com/api/v6/dex/market/token/search?chains=1&search=USDY&limit=100",
    );
  });

  it("resolves one exact X Layer token symbol without guessing among partial matches", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const response = {
      code: "0", msg: "", data: [{ chainIndex: "196", tokenContractAddress: token,
        tokenName: "Example Token", tokenSymbol: "EXAMPLE", decimal: "18",
        price: "2.50", liquidity: "100000", holders: "1200", tagList: {} },
      { chainIndex: "196", tokenContractAddress: "0x2222222222222222222222222222222222222222",
        tokenName: "Example Two", tokenSymbol: "EXAMPLE2", decimal: "18",
        price: "3", liquidity: "200000", holders: "900", tagList: {} }],
    };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json(response)));
    const client = createOkxClient({ credentials, fetchImpl,
      now: () => new Date("2026-08-21T10:00:00.000Z") });

    await expect(client.searchXLayerToken("example")).resolves.toEqual({
      chainId: 196, token, name: "Example Token", symbol: "EXAMPLE", decimals: 18,
      priceUsd: "2.50", liquidityUsd: "100000", holderCount: "1200",
    });
    await expect(client.searchXLayerTokens("example")).resolves.toMatchObject([
      { chainId: 196, token, symbol: "EXAMPLE" },
      { chainId: 196, symbol: "EXAMPLE2" },
    ]);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://web3.okx.com/api/v6/dex/market/token/search?chains=196&search=example&limit=100",
    );
  });

  it("returns exact X Layer token identity, price, liquidity, and holder concentration", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: token, tokenName: "USDG",
        tokenSymbol: "USDG", decimal: "6", tagList: { communityRecognized: true },
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: token, time: "1787299200000",
        price: "0.9998", liquidity: "2500000.50", holders: "4200",
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [
        { holderWalletAddress: "0x2222222222222222222222222222222222222222", holdPercent: "12.5" },
        { holderWalletAddress: "0x3333333333333333333333333333333333333333", holdPercent: "7.25" },
      ] }));
    const client = createOkxClient({ credentials, fetchImpl,
      now: () => new Date("2026-08-21T10:00:00.000Z") });

    await expect(client.getXLayerTokenEvidence(token)).resolves.toEqual({
      chainId: 196, token, name: "USDG", symbol: "USDG", decimals: 6,
      priceUsd: "0.9998", liquidityUsd: "2500000.50", holderCount: "4200",
      top10HolderPercent: "19.75", marketDataAt: "2026-08-21T08:00:00.000Z",
      communityRecognized: true,
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://web3.okx.com/api/v6/dex/market/token/basic-info",
      "https://web3.okx.com/api/v6/dex/market/price-info",
      `https://web3.okx.com/api/v6/dex/market/token/holder?chainIndex=196&tokenContractAddress=${token}&limit=10`,
    ]);
  });

  it("returns authenticated token evidence for Ethereum with exact holder addresses", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const holder = "0x2222222222222222222222222222222222222222";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "1", tokenContractAddress: token, tokenName: "Example",
        tokenSymbol: "EX", decimal: "18", tagList: {},
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "1", tokenContractAddress: token, time: "1787299200000",
        price: "2.5", liquidity: "1000000", holders: "50",
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [
        { holderWalletAddress: holder, holdPercent: "42" },
      ] }));
    const client = createOkxClient({ credentials, fetchImpl });

    await expect(client.getTokenEvidence(1, token)).resolves.toMatchObject({
      chainId: 1, token, topHolderAddresses: [holder], top10HolderPercent: "42",
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://web3.okx.com/api/v6/dex/market/token/basic-info",
      "https://web3.okx.com/api/v6/dex/market/price-info",
      `https://web3.okx.com/api/v6/dex/market/token/holder?chainIndex=1&tokenContractAddress=${token}&limit=10`,
    ]);
    expect(fetchImpl.mock.calls[0]![1]?.body).toBe(
      JSON.stringify([{ chainIndex: "1", tokenContractAddress: token }]),
    );
  });

  it("returns an exact executable quote into the chain reference asset", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const reference = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: "0", msg: "", data: [{ chainIndex: "1", swapMode: "exactIn",
        fromTokenAmount: "1000000000000000000", toTokenAmount: "2490000",
        priceImpactPercent: "0.4", dexRouterList: [{ dexProtocol: { dexName: "Uni", percent: "100" } }],
        fromToken: { tokenContractAddress: token, decimal: "18", isHoneyPot: false, taxRate: "0" },
        toToken: { tokenContractAddress: reference, decimal: "6", isHoneyPot: false, taxRate: "0" },
      }],
    }));
    const client = createOkxClient({ credentials, fetchImpl,
      now: () => new Date("2026-08-21T10:00:00.000Z") });

    await expect(client.getExecutableQuote(1, token, "1000000000000000000")).resolves.toEqual({
      chainId: 1, fromToken: token, toToken: reference,
      inputAtomic: "1000000000000000000", outputAtomic: "2490000",
      outputDecimals: 6, priceImpactBps: 40, fetchedAt: "2026-08-21T10:00:00.000Z",
      route: [{ dexProtocol: { dexName: "Uni", percent: "100" } }],
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("/api/v6/dex/aggregator/quote?");
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("priceImpactProtectionPercent=5");
  });

  it("rejects market data for a different contract", async () => {
    const token = "0x1111111111111111111111111111111111111111";
    const other = "0x9999999999999999999999999999999999999999";
    const client = createOkxClient({ credentials, fetchImpl: vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: other, tokenName: "Fake",
        tokenSymbol: "FAKE", decimal: "18", tagList: {},
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [{
        chainIndex: "196", tokenContractAddress: token, time: "1787299200000",
        price: "1", liquidity: "1", holders: "1",
      }] }))
      .mockResolvedValueOnce(Response.json({ code: "0", msg: "", data: [] })),
    });

    await expect(client.getXLayerTokenEvidence(token)).rejects.toThrow(/identity/i);
  });
});
