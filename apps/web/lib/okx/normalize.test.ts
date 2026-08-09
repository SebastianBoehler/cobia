import { describe, expect, it } from "vitest";
import type { RawProductDetail } from "./client";
import { decimalToScaledInteger, normalizeAaveProduct } from "./normalize";

const poolAddress = "0x2222222222222222222222222222222222222222";
const retrievedAt = "2026-08-09T10:00:00.000Z";

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
      tokenAddress: "0x1111111111111111111111111111111111111111",
      chainIndex: "196",
      tokenPrecision: 6,
    },
  ],
};

const unsupportedProducts: Array<[RawProductDetail, string]> = [
  [{ ...detail, chainIndex: "1" }, "X Layer"],
  [{ ...detail, platformName: "Compound" }, "Aave V3"],
  [{ ...detail, isInvestable: false }, "not investable"],
  [
    {
      ...detail,
      underlyingToken: [{ ...detail.underlyingToken[0], tokenSymbol: "USDT0" }],
    },
    "expected asset",
  ],
];

describe("OKX numeric normalization", () => {
  it("scales decimal strings without floating point", () => {
    expect(decimalToScaledInteger("0.064299", 4)).toBe(642n);
    expect(decimalToScaledInteger("500000000.2500009", 6)).toBe(
      500_000_000_250_000n,
    );
  });

  it.each(["-1", "1e4", "", ".25", "1."])(
    "rejects non-canonical decimal %s",
    (value) => {
      expect(() => decimalToScaledInteger(value, 6)).toThrow(
        "Invalid unsigned decimal",
      );
    },
  );
});

describe("Aave product normalization", () => {
  it("produces integer snapshot fields for an investable X Layer product", () => {
    expect(
      normalizeAaveProduct(detail, {
        expectedSymbol: "USDG",
        poolAddress,
        retrievedAt,
      }),
    ).toEqual({
      asset: {
        address: "0x1111111111111111111111111111111111111111",
        symbol: "USDG",
        decimals: 6,
      },
      candidate: {
        id: "aave-v3:9001",
        kind: "aave-v3",
        investmentId: "9001",
        poolAddress,
        apyBps: 642,
        tvlUsdE6: "500000000250000",
        utilizationBps: 7_200,
        retrievedAt,
      },
    });
  });

  it.each(unsupportedProducts)("rejects an unsupported product", (input, message) => {
    expect(() =>
      normalizeAaveProduct(input, {
        expectedSymbol: "USDG",
        poolAddress,
        retrievedAt,
      }),
    ).toThrow(message);
  });
});
