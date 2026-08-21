import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshCommerceDiscoveryV1 } from "../../../../lib/runtime/commerce";
import { PUBLIC_CACHE_30_SECONDS } from "../../../../lib/http/cache-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(url.searchParams));
    const generatedAt = Math.floor(Date.now() / 1_000);
    const result = await refreshCommerceDiscoveryV1({ nowSec: generatedAt, limit: query.limit });
    return NextResponse.json({ ...result, generatedAt }, {
      headers: { "Cache-Control": PUBLIC_CACHE_30_SECONDS },
    });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_COMMERCE_DISCOVERY_QUERY" : "COMMERCE_DISCOVERY_UNAVAILABLE",
      message: invalid
        ? "Commerce discovery pagination is invalid."
        : "Commerce discovery is temporarily unavailable.",
    }, { status: invalid ? 400 : 503 });
  }
}
