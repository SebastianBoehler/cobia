import { type Address } from "viem";
import { INTENT_ASSETS, RWA_INTENT_ASSETS } from "../intents/capability-templates";
import type { SolverToolV1 } from "../solver-tools/types";
import type { XStocksToolValueV1 } from "../solver-tools/xstocks";

type Tool = SolverToolV1<
  { operation: "get"; symbol: string } | { operation: "list"; page: number },
  XStocksToolValueV1
>;

interface OkxTokenLookup {
  searchXLayerToken(search: string): Promise<{
    chainId: 196;
    token: Address;
    name: string;
    symbol: string;
    decimals: number;
    priceUsd: string;
    liquidityUsd: string;
    holderCount?: string;
  } | undefined>;
}

export interface ResolvedAssetMentionV1 {
  symbol: string;
  name: string;
  chainId: 196 | 1;
  address: Address;
  status: "supported" | "registered" | "research-only";
  underlyingIdentifier?: string;
  priceUsd?: string;
  liquidityUsd?: string;
  holderCount?: string;
}

function canonicalXStockSymbol(symbol: string): string | undefined {
  if (!/^[A-Za-z0-9.]{1,15}x$/i.test(symbol)) return undefined;
  return `${symbol.slice(0, -1).toUpperCase()}x`;
}

export async function resolveAssetMentionsV1(
  symbols: readonly string[],
  xstocks: Tool,
  okx?: OkxTokenLookup,
): Promise<{
  assets: ResolvedAssetMentionV1[];
  unresolved: string[];
}> {
  const unique = [...new Map(symbols.slice(0, 8).map((symbol) => [symbol.toLowerCase(), symbol])).values()];
  const assets: ResolvedAssetMentionV1[] = [];
  const unresolved: string[] = [];

  await Promise.all(unique.map(async (symbol) => {
    const supported = INTENT_ASSETS.find((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase());
    if (supported) {
      assets.push({ symbol: supported.symbol, name: supported.symbol, chainId: 196,
        address: supported.address, status: "supported" });
      return;
    }
    const registered = RWA_INTENT_ASSETS.find((asset) =>
      asset.symbol.toLowerCase() === symbol.toLowerCase());
    if (registered) {
      assets.push({ symbol: registered.symbol, name: registered.instrument.displayName,
        chainId: registered.instrument.chainId, address: registered.address, status: "registered",
        underlyingIdentifier: registered.instrument.underlyingIdentifier });
      return;
    }
    const canonical = canonicalXStockSymbol(symbol);
    if (canonical) {
      const result = await xstocks.run({ operation: "get", symbol: canonical });
      const discovered = result.status === "ok"
        ? result.value.assets.find((asset) => asset.symbol.toLowerCase() === canonical.toLowerCase())
        : undefined;
      if (discovered) {
        assets.push({ symbol: discovered.symbol, name: discovered.name, chainId: 196,
          address: discovered.deployment.address, status: "research-only",
          underlyingIdentifier: discovered.underlyingIsin });
        return;
      }
    }
    if (!okx || !/^[A-Za-z0-9.$_-]{1,32}$/.test(symbol)) {
      unresolved.push(symbol);
      return;
    }
    const token = await okx.searchXLayerToken(symbol);
    if (!token) { unresolved.push(symbol); return; }
    assets.push({ symbol: token.symbol, name: token.name, chainId: 196,
      address: token.token, status: "research-only", priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd, holderCount: token.holderCount });
  }));

  const order = new Map(unique.map((symbol, index) => [symbol.toLowerCase(), index]));
  assets.sort((a, b) => (order.get(a.symbol.toLowerCase()) ?? 99) -
    (order.get(b.symbol.toLowerCase()) ?? 99));
  unresolved.sort((a, b) => (order.get(a.toLowerCase()) ?? 99) - (order.get(b.toLowerCase()) ?? 99));
  return { assets, unresolved };
}
