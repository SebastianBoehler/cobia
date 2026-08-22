import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { isAddressEqual } from "viem";
import { createTtlAsyncCache } from "../cache/ttl-async-cache";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";

export type IntentAssetPrices = Readonly<Record<string, string>>;

const cache = createTtlAsyncCache<IntentAssetPrices>({ ttlMs: 30_000, maxEntries: 1 });

export function readIntentAssetPrices(): Promise<IntentAssetPrices> {
  return cache.get("x-layer-intent-assets", async () => {
    const client = createOkxClient({ credentials: readOkxCredentials() });
    const expected = [
      { querySymbol: "OKB", displaySymbol: "OKB", address: NATIVE_ASSET_ADDRESS },
      ...SUPPORTED_ASSETS.map(({ symbol, displaySymbol, address }) => ({
        querySymbol: symbol,
        displaySymbol,
        address,
      })),
    ];
    const resolved = await Promise.all(expected.map(async (asset) => ({
      asset,
      token: await client.searchXLayerToken(asset.querySymbol),
    })));
    if (resolved.some(({ asset, token }) => !token || token.symbol !== asset.querySymbol ||
        !isAddressEqual(token.token, asset.address))) {
      throw new Error("Exact X Layer asset price identity is unavailable");
    }
    return Object.fromEntries(resolved.map(({ asset, token }) =>
      [asset.displaySymbol, token!.priceUsd]));
  });
}
