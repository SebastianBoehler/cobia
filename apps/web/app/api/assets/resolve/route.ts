import { z } from "zod";
import { resolveAssetMentionsV1 } from "../../../../lib/assets/resolve-mentions";
import { readOkxCredentials } from "../../../../lib/env";
import { createOkxClient } from "../../../../lib/okx/client";
import { createXStocksInstrumentToolV1 } from "../../../../lib/solver-tools/xstocks";
import { createTtlAsyncCache, type AsyncCache } from "../../../../lib/cache/ttl-async-cache";

const RequestSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
}).strict();

export type AssetResolution = Awaited<ReturnType<typeof resolveAssetMentionsV1>>;
const resolutionCache = createTtlAsyncCache<AssetResolution>({ ttlMs: 60_000, maxEntries: 256 });

export async function resolveAssetMentionRequest(
  request: Request,
  xstocks = createXStocksInstrumentToolV1(),
  okx?: Pick<ReturnType<typeof createOkxClient>, "searchXLayerToken">,
  cache?: AsyncCache<AssetResolution>,
): Promise<Response> {
  try {
    const { symbols } = RequestSchema.parse(await request.json());
    const key = symbols.map((symbol) => symbol.toLowerCase()).join("\0");
    const result = cache
      ? await cache.get(key, () => resolveAssetMentionsV1(symbols, xstocks, okx))
      : await resolveAssetMentionsV1(symbols, xstocks, okx);
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
  return resolveAssetMentionRequest(request, createXStocksInstrumentToolV1(), {
    searchXLayerToken(search) {
      return createOkxClient({ credentials: readOkxCredentials() }).searchXLayerToken(search);
    },
  }, resolutionCache);
}
