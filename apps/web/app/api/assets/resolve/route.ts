import { z } from "zod";
import { resolveAssetMentionsV1 } from "../../../../lib/assets/resolve-mentions";
import { createXStocksInstrumentToolV1 } from "../../../../lib/solver-tools/xstocks";

const RequestSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
}).strict();

export async function resolveAssetMentionRequest(
  request: Request,
  xstocks = createXStocksInstrumentToolV1(),
): Promise<Response> {
  try {
    const { symbols } = RequestSchema.parse(await request.json());
    const result = await resolveAssetMentionsV1(symbols, xstocks);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ code: "ASSET_RESOLUTION_INVALID",
      message: "Provide one to eight valid token symbols." }, { status: 400 });
  }
}

export async function POST(request: Request): Promise<Response> {
  return resolveAssetMentionRequest(request);
}
