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
