import { z } from "zod";
import {
  resolveAssetMentionsV1,
  resolveAssetSuggestionsV1,
  resolveAssetSelectorsV2,
  listXStocksCatalogV1,
  type GeneralAssetEligibilityV2,
} from "../../../../lib/assets/resolve-mentions";
import { readOkxCredentials } from "../../../../lib/env";
import { createOkxClient } from "../../../../lib/okx/client";
import { createProductionGeneralAssetEligibilityV2 } from
  "../../../../lib/assets/production-general-asset-eligibility";
import { createXStocksInstrumentToolV1, type XStocksInstrumentV1 } from "../../../../lib/solver-tools/xstocks";
import { createTtlAsyncCache, type AsyncCache } from "../../../../lib/cache/ttl-async-cache";

const SymbolRequestSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
}).strict();
const SuggestionRequestSchema = z.object({ query: z.string().trim().min(1).max(32) }).strict();
const ChainSchema = z.union([z.literal(1), z.literal(196)]);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase() as `0x${string}`);
const MaximumAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78).optional();
const SelectorSchema = z.union([
  z.object({ chainId: ChainSchema, address: AddressSchema,
    maximumAtomic: MaximumAtomicSchema }).strict(),
  z.object({ chainId: ChainSchema, symbol: z.string().trim().min(1).max(64),
    maximumAtomic: MaximumAtomicSchema }).strict(),
]);
const AssetRequestSchema = z.object({ assets: z.array(SelectorSchema).min(1).max(16) }).strict();
const RequestSchema = z.union([SymbolRequestSchema, SuggestionRequestSchema, AssetRequestSchema]);

export type AssetResolution = Awaited<ReturnType<typeof resolveAssetMentionsV1>> |
  Awaited<ReturnType<typeof resolveAssetSuggestionsV1>> |
  Awaited<ReturnType<typeof resolveAssetSelectorsV2>>;
const resolutionCache = createTtlAsyncCache<AssetResolution>({ ttlMs: 30_000, maxEntries: 256 });
const xStocksCatalogCache = createTtlAsyncCache<XStocksInstrumentV1[]>({ ttlMs: 300_000, maxEntries: 1 });

interface AssetLookupClient {
  searchToken?(chainId: 1 | 196, search: string): Promise<{
    chainId: 1 | 196; token: `0x${string}`; name: string; symbol: string; decimals: number;
    priceUsd: string; liquidityUsd: string; holderCount?: string;
  } | undefined>;
  searchXLayerToken?(search: string): Promise<{
    chainId: 196; token: `0x${string}`; name: string; symbol: string; decimals: number;
    priceUsd: string; liquidityUsd: string; holderCount?: string;
  } | undefined>;
  searchXLayerTokens?(search: string): Promise<Array<{
    chainId: 196; token: `0x${string}`; name: string; symbol: string; decimals: number;
    priceUsd: string; liquidityUsd: string; holderCount?: string;
  }>>;
}

export async function resolveAssetMentionRequest(
  request: Request,
  xstocks = createXStocksInstrumentToolV1(),
  okx?: AssetLookupClient,
  cache?: AsyncCache<AssetResolution>,
  verifier?: { eligibility(asset: { chainId: 1 | 196; token: `0x${string}`; inputAtomic?: string }):
    Promise<GeneralAssetEligibilityV2> },
  catalogCache: AsyncCache<XStocksInstrumentV1[]> = xStocksCatalogCache,
): Promise<Response> {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const load = () => {
      if ("symbols" in parsed) {
        return resolveAssetMentionsV1(parsed.symbols, xstocks,
          okx?.searchXLayerToken ? { searchXLayerToken: okx.searchXLayerToken } : undefined);
      }
      if ("query" in parsed) {
        return catalogCache.get("xlayer", () => listXStocksCatalogV1(xstocks)).then((catalog) =>
          resolveAssetSuggestionsV1(parsed.query, catalog,
            okx?.searchXLayerTokens ? { searchXLayerToken: okx.searchXLayerToken!,
              searchXLayerTokens: okx.searchXLayerTokens } : undefined));
      }
      if (!okx?.searchToken) throw new Error("General token lookup is unavailable");
      return resolveAssetSelectorsV2(parsed.assets, xstocks, { searchToken: okx.searchToken }, verifier);
    };
    const key = "symbols" in parsed
      ? `symbols:${parsed.symbols.map((symbol) => symbol.toLowerCase()).join("\0")}`
      : "query" in parsed ? `query:${parsed.query.toLowerCase()}`
      : `assets:${parsed.assets.map((asset) => "address" in asset
        ? `${asset.chainId}:${asset.address}:${asset.maximumAtomic ?? "output"}`
        : `${asset.chainId}:${asset.symbol.toLowerCase()}:${asset.maximumAtomic ?? "output"}`).join("\0")}`;
    const result = cache ? await cache.get(key, load) : await load();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      return Response.json({ code: "ASSET_RESOLUTION_UNAVAILABLE",
        message: "Fresh token evidence could not be resolved." }, { status: 502 });
    }
    return Response.json({ code: "ASSET_RESOLUTION_INVALID",
      message: "Provide one to eight valid token symbols." }, { status: 400 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let okx: ReturnType<typeof createOkxClient> | undefined;
  const getOkx = () => okx ??= createOkxClient({ credentials: readOkxCredentials() });
  return resolveAssetMentionRequest(request, createXStocksInstrumentToolV1(), {
    searchToken(chainId, search) {
      return getOkx().searchToken(chainId, search);
    },
    searchXLayerToken(search) {
      return getOkx().searchXLayerToken(search);
    },
    searchXLayerTokens(search) {
      return getOkx().searchXLayerTokens(search);
    },
  }, resolutionCache, { eligibility(asset) {
    return createProductionGeneralAssetEligibilityV2().eligibility(asset);
  } });
}
