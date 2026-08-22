import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchToken: vi.fn(async (chainId: 1 | 196, symbol: string) => {
    const tokens = {
      OKB: {
        chainId: 196 as const,
        token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const,
        name: "X Layer",
        symbol: "OKB",
        decimals: 18,
        priceUsd: "111.93",
        liquidityUsd: "1",
      },
      USDG: {
        chainId: 196 as const,
        token: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const,
        name: "USDG",
        symbol: "USDG",
        decimals: 6,
        priceUsd: "1.0001",
        liquidityUsd: "1",
      },
      USDT: {
        chainId: 196 as const,
        token: "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const,
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        priceUsd: "0.9999",
        liquidityUsd: "1",
      },
    };
    return chainId === 196 ? tokens[symbol as keyof typeof tokens] : undefined;
  }),
}));

vi.mock("../env", () => ({ readOkxCredentials: () => ({}) }));
vi.mock("../okx/client", () => ({
  createOkxClient: () => ({ searchToken: mocks.searchToken }),
}));

import { readIntentAssetPrices } from "./intent-asset-prices";

describe("intent asset prices", () => {
  it("queries the canonical USDT symbol and keeps other verified prices after a partial failure", async () => {
    mocks.searchToken.mockImplementationOnce(async () => undefined);

    await expect(readIntentAssetPrices()).resolves.toEqual({
      USDG: "1.0001",
      USDt0: "0.9999",
    });
    expect(mocks.searchToken).toHaveBeenCalledWith(196, "USDT");
    expect(mocks.searchToken).not.toHaveBeenCalledWith(196, "USDt0");
  });
});
