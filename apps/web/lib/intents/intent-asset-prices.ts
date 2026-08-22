import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { isAddressEqual } from "viem";
import { createTtlAsyncCache } from "../cache/ttl-async-cache";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { INTENT_ASSETS } from "./capability-templates";

export type IntentAssetPrices = Readonly<Record<string, string>>;

const cache = createTtlAsyncCache<IntentAssetPrices>({ ttlMs: 30_000, maxEntries: 1 });

export function readIntentAssetPrices(): Promise<IntentAssetPrices> {
  return cache.get("x-layer-intent-assets", async () => {
    const client = createOkxClient({ credentials: readOkxCredentials() });
    const expected = [
      { symbol: "OKB", address: NATIVE_ASSET_ADDRESS },
      ...INTENT_ASSETS.map(({ symbol, address }) => ({ symbol, address })),
    ];
    const resolved = await Promise.all(expected.map(async (asset) => ({
      asset,
      token: await client.searchXLayerToken(asset.symbol),
    })));
    if (resolved.some(({ asset, token }) => !token || token.symbol !== asset.symbol ||
        !isAddressEqual(token.token, asset.address))) {
      throw new Error("Exact X Layer asset price identity is unavailable");
    }
    return Object.fromEntries(resolved.map(({ asset, token }) =>
      [asset.symbol, token!.priceUsd]));
  });
}
