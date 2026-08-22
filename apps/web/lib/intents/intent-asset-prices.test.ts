import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchXLayerToken: vi.fn(async (symbol: string) => {
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
    return tokens[symbol as keyof typeof tokens];
  }),
}));

vi.mock("../env", () => ({ readOkxCredentials: () => ({}) }));
vi.mock("../okx/client", () => ({
  createOkxClient: () => ({ searchXLayerToken: mocks.searchXLayerToken }),
}));

import { readIntentAssetPrices } from "./intent-asset-prices";

describe("intent asset prices", () => {
  it("queries the canonical USDT symbol and exposes its price as USDt0", async () => {
    await expect(readIntentAssetPrices()).resolves.toEqual({
      OKB: "111.93",
      USDG: "1.0001",
      USDt0: "0.9999",
    });
    expect(mocks.searchXLayerToken).toHaveBeenCalledWith("USDT");
    expect(mocks.searchXLayerToken).not.toHaveBeenCalledWith("USDt0");
  });
});
