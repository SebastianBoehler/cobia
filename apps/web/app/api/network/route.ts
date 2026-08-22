import { NextResponse } from "next/server";
import { z } from "zod";
import { PUBLIC_CACHE_30_SECONDS } from "../../../lib/http/cache-policy";
import { getNetworkOutcomeRepository } from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  window: z.enum(["30d", "all"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().nullable().default(null),
}).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await getNetworkOutcomeRepository().read({
      ...query,
      observedAtSec: Math.floor(Date.now() / 1_000),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": PUBLIC_CACHE_30_SECONDS },
    });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_NETWORK_QUERY" : "NETWORK_UNAVAILABLE",
      message: invalid ? "Network aggregation parameters are invalid."
        : "Verified network evidence is temporarily unavailable.",
    }, { status: invalid ? 400 : 503 });
  }
}
