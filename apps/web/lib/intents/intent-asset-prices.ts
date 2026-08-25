import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { isAddressEqual } from "viem";
import { createTtlAsyncCache } from "../cache/ttl-async-cache";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { RWA_INTENT_ASSETS } from "./capability-templates";

export type IntentAssetPrices = Readonly<Record<string, string>>;

const cache = createTtlAsyncCache<IntentAssetPrices>({ ttlMs: 30_000, maxEntries: 1 });

export function readIntentAssetPrices(
  rwaSymbols: readonly string[] = [],
): Promise<IntentAssetPrices> {
  const requestedRwa = new Set(rwaSymbols.map((symbol) => symbol.toLowerCase()));
  const cacheKey = [...requestedRwa].sort().join(",");
  return cache.get(`intent-assets:${cacheKey}`, async () => {
    const client = createOkxClient({ credentials: readOkxCredentials() });
    const expected = [
      { chainId: 196 as const, querySymbol: "OKB", displaySymbol: "OKB",
        address: NATIVE_ASSET_ADDRESS },
      ...SUPPORTED_ASSETS.map(({ symbol, displaySymbol, address }) => ({
        chainId: 196 as const, querySymbol: symbol, displaySymbol, address,
      })),
      ...RWA_INTENT_ASSETS.filter(({ symbol }) => requestedRwa.has(symbol.toLowerCase()))
        .map(({ symbol, address, instrument }) => ({
        chainId: instrument.chainId, querySymbol: symbol, displaySymbol: symbol, address,
      })),
    ];
    const resolved = [];
    for (const asset of expected) {
      const token = await client.searchToken(asset.chainId, asset.querySymbol)
        .catch(() => undefined);
      resolved.push({ asset, token });
    }
    return Object.fromEntries(resolved.flatMap(({ asset, token }) =>
      token?.priceUsd && token.symbol === asset.querySymbol && isAddressEqual(token.token, asset.address)
        ? [[asset.displaySymbol, token.priceUsd]] : []));
  });
}
