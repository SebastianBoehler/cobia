import { getAddress, isAddressEqual, type Address, type Hash } from "viem";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { USDG_ADDRESS } from "../chain/xlayer";
import { INTENT_ASSETS, RWA_INTENT_ASSETS } from "../intents/capability-templates";
import type { SolverToolV1 } from "../solver-tools/types";
import type { XStocksInstrumentV1, XStocksToolValueV1 } from "../solver-tools/xstocks";

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
    priceUsd?: string;
    liquidityUsd?: string;
    holderCount?: string;
  } | undefined>;
}

interface OkxTokenSearch extends OkxTokenLookup {
  searchXLayerTokens(search: string): Promise<Array<{
    chainId: 196;
    token: Address;
    name: string;
    symbol: string;
    decimals: number;
    priceUsd?: string;
    liquidityUsd?: string;
    holderCount?: string;
  }>>;
}

export type GeneralAssetEligibilityV2 =
  | { status: "eligible"; identityHash: Hash; valuationHash?: Hash }
  | { status: "verification_pending"; reason: string }
  | { status: "unsupported"; reason: string };

interface GeneralTokenLookupV2 {
  searchToken(chainId: 1 | 196, search: string): Promise<{
    chainId: 1 | 196;
    token: Address;
    name: string;
    symbol: string;
    decimals: number;
    priceUsd?: string;
    liquidityUsd?: string;
    holderCount?: string;
  } | undefined>;
}

interface GeneralAssetEligibilityResolverV2 {
  eligibility(asset: { chainId: 1 | 196; token: Address; inputAtomic?: string }): Promise<GeneralAssetEligibilityV2>;
}

export type GeneralAssetSelectorV2 = {
  chainId: 1 | 196;
  address: Address;
  maximumAtomic?: string;
} | {
  chainId: 1 | 196;
  symbol: string;
  maximumAtomic?: string;
};

export interface ResolvedGeneralAssetV2 {
  chainId: 1 | 196;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  status: GeneralAssetEligibilityV2["status"];
  reason?: string;
  identityHash?: Hash;
  valuationHash?: Hash;
  priceUsd?: string;
  liquidityUsd?: string;
  holderCount?: string;
}

export interface ResolvedAssetMentionV1 {
  symbol: string;
  name: string;
  chainId: 196 | 1;
  address: Address;
  decimals: number;
  status: "supported" | "registered" | "catalog-backed" | "research-only";
  underlyingIdentifier?: string;
  priceUsd?: string;
  liquidityUsd?: string;
  holderCount?: string;
}

function canonicalXStockSymbol(symbol: string): string | undefined {
  if (!/^[A-Za-z0-9.]{1,15}x$/i.test(symbol)) return undefined;
  return `${symbol.slice(0, -1).toUpperCase()}x`;
}

function xStockMention(asset: XStocksInstrumentV1): ResolvedAssetMentionV1 {
  const atomicUsdG = asset.deployment.stablecoins.some(({ symbol, address, supportsAtomicSwaps }) =>
    symbol === "USDG" && supportsAtomicSwaps && isAddressEqual(address, USDG_ADDRESS));
  return {
    symbol: asset.symbol, name: asset.name, chainId: 196, address: asset.deployment.address,
    decimals: 18,
    status: !asset.isTradingHalted && asset.deployment.supportsAtomicSwaps && atomicUsdG
      ? "catalog-backed" : "research-only",
    underlyingIdentifier: asset.underlyingIsin,
  };
}

export async function listXStocksCatalogV1(xstocks: Tool): Promise<XStocksInstrumentV1[]> {
  const assets: XStocksInstrumentV1[] = [];
  for (let page = 0; page < 100; page += 1) {
    const result = await xstocks.run({ operation: "list", page });
    if (result.status !== "ok") throw new Error("xStocks catalog is unavailable");
    assets.push(...result.value.assets);
    if (!result.value.hasNextPage) break;
  }
  return [...new Map(assets.map((asset) => [asset.deployment.address.toLowerCase(), asset])).values()];
}

function matchesSuggestion(asset: { symbol: string; name: string }, query: string): boolean {
  const normalized = query.toLowerCase();
  return asset.symbol.toLowerCase().includes(normalized) || asset.name.toLowerCase().includes(normalized);
}

export async function resolveAssetSuggestionsV1(
  query: string,
  xStocksCatalog: readonly XStocksInstrumentV1[],
  okx?: OkxTokenSearch,
): Promise<{ assets: ResolvedAssetMentionV1[] }> {
  const normalized = query.trim();
  if (!normalized) return { assets: [] };
  const discovered = xStocksCatalog.filter((asset) => matchesSuggestion(asset, normalized)).map(xStockMention);
  const market = okx ? await okx.searchXLayerTokens(normalized).catch(() => []) : [];
  const marketSymbols = new Set(market.map(({ symbol }) => symbol.toLowerCase()));
  const xStocks = discovered.filter(({ symbol }) => !marketSymbols.has(symbol.toLowerCase()));
  const assets = [...xStocks, ...market.map((token) => ({
    symbol: token.symbol, name: token.name, chainId: 196 as const, address: token.token,
    decimals: token.decimals,
    status: "research-only" as const, priceUsd: token.priceUsd, liquidityUsd: token.liquidityUsd,
    holderCount: token.holderCount,
  }))];
  const unique = new Map<string, ResolvedAssetMentionV1>();
  for (const asset of assets) unique.set(`${asset.chainId}:${asset.address.toLowerCase()}`, asset);
  return { assets: [...unique.values()].sort((left, right) => {
    const leftStarts = left.symbol.toLowerCase().startsWith(normalized.toLowerCase()) ? 0 : 1;
    const rightStarts = right.symbol.toLowerCase().startsWith(normalized.toLowerCase()) ? 0 : 1;
    return leftStarts - rightStarts || left.symbol.localeCompare(right.symbol);
  }).slice(0, 8) };
}

async function exactXLayerPrice(
  symbol: string,
  address: Address,
  okx?: OkxTokenLookup,
): Promise<string | undefined> {
  if (!okx) return undefined;
  try {
    const token = await okx.searchXLayerToken(symbol);
    return token && isAddressEqual(token.token, address) ? token.priceUsd : undefined;
  } catch {
    return undefined;
  }
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
      const canonical = SUPPORTED_ASSETS.find((asset) =>
        isAddressEqual(asset.address, supported.address));
      assets.push({ symbol: supported.symbol, name: supported.symbol, chainId: 196,
        address: supported.address, decimals: supported.decimals, status: "supported",
        priceUsd: await exactXLayerPrice(canonical?.symbol ?? supported.symbol,
          supported.address, okx) });
      return;
    }
    const registered = RWA_INTENT_ASSETS.find((asset) =>
      asset.symbol.toLowerCase() === symbol.toLowerCase());
    if (registered) {
      assets.push({ symbol: registered.symbol, name: registered.instrument.displayName,
        chainId: registered.instrument.chainId, address: registered.address, decimals: registered.decimals,
        status: "registered",
        priceUsd: registered.instrument.chainId === 196
          ? await exactXLayerPrice(registered.symbol, registered.address, okx) : undefined,
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
        assets.push(xStockMention(discovered));
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
      address: token.token, decimals: token.decimals, status: "research-only", priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd, holderCount: token.holderCount });
  }));

  const order = new Map(unique.map((symbol, index) => [symbol.toLowerCase(), index]));
  assets.sort((a, b) => (order.get(a.symbol.toLowerCase()) ?? 99) -
    (order.get(b.symbol.toLowerCase()) ?? 99));
  unresolved.sort((a, b) => (order.get(a.toLowerCase()) ?? 99) - (order.get(b.toLowerCase()) ?? 99));
  return { assets, unresolved };
}

function pendingEligibility(): GeneralAssetEligibilityV2 {
  return {
    status: "verification_pending",
    reason: "Independent asset verification has not completed.",
  };
}

function ambiguousToken(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "AMBIGUOUS_TOKEN";
}

export async function resolveAssetSelectorsV2(
  selectors: readonly GeneralAssetSelectorV2[],
  _xstocks: Tool,
  lookup: GeneralTokenLookupV2,
  verifier?: GeneralAssetEligibilityResolverV2,
): Promise<{
  assets: ResolvedGeneralAssetV2[];
  unresolved: GeneralAssetSelectorV2[];
  ambiguities: Array<{ chainId: 1 | 196; symbol: string }>;
}> {
  const unique = [...new Map(selectors.slice(0, 16).map((selector) => {
    const key = "address" in selector
      ? `${selector.chainId}:address:${selector.address.toLowerCase()}:${selector.maximumAtomic ?? "output"}`
      : `${selector.chainId}:symbol:${selector.symbol.toLowerCase()}:${selector.maximumAtomic ?? "output"}`;
    return [key, selector];
  })).values()];
  const assets: ResolvedGeneralAssetV2[] = [];
  const unresolved: GeneralAssetSelectorV2[] = [];
  const ambiguities: Array<{ chainId: 1 | 196; symbol: string }> = [];

  await Promise.all(unique.map(async (selector) => {
    const search = "address" in selector ? selector.address : selector.symbol;
    let token: Awaited<ReturnType<GeneralTokenLookupV2["searchToken"]>>;
    try {
      token = await lookup.searchToken(selector.chainId, search);
    } catch (error) {
      if ("symbol" in selector && ambiguousToken(error)) {
        ambiguities.push({ chainId: selector.chainId, symbol: selector.symbol });
        return;
      }
      throw error;
    }
    if (!token || token.chainId !== selector.chainId ||
        ("address" in selector && !isAddressEqual(token.token, selector.address))) {
      unresolved.push(selector);
      return;
    }
    const address = getAddress(token.token).toLowerCase() as Address;
    const eligibility = verifier
      ? await verifier.eligibility({ chainId: selector.chainId, token: address,
        ...(selector.maximumAtomic ? { inputAtomic: selector.maximumAtomic } : {}) })
      : pendingEligibility();
    assets.push({
      chainId: selector.chainId,
      address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      holderCount: token.holderCount,
      ...eligibility,
    });
  }));
  const key = (value: { chainId: number; address?: string; symbol?: string }) =>
    `${value.chainId}:${value.address?.toLowerCase() ?? value.symbol?.toLowerCase()}`;
  assets.sort((left, right) => key(left).localeCompare(key(right)));
  unresolved.sort((left, right) => key(left).localeCompare(key(right)));
  ambiguities.sort((left, right) => key(left).localeCompare(key(right)));
  return { assets, unresolved, ambiguities };
}
