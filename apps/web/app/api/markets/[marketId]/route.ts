import { NextResponse } from "next/server";
import { getMarketRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function historyPage(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitValue = searchParams.get("limit");
  const limit = limitValue === null ? undefined : Number(limitValue);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return undefined;
  }
  return {
    limit,
    cursor: searchParams.get("cursor") || undefined,
  };
}

export async function GET(request: Request, context: RouteContext<"/api/markets/[marketId]">) {
  const { marketId } = await context.params;
  const page = historyPage(request);
  if (!page) {
    return NextResponse.json({
      code: "INVALID_HISTORY_PAGE",
      message: "History limit must be an integer between 1 and 50.",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const market = await getMarketRepository()
      .getMarket(marketId, Math.floor(Date.now() / 1_000), page);
    return market
      ? NextResponse.json(market, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "NOT_FOUND", message: "Earn market not found." }, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
  } catch (error) {
    const invalidCursor = error instanceof Error
      && error.message === "Invalid market history cursor";
    return NextResponse.json({
      code: invalidCursor ? "INVALID_HISTORY_CURSOR" : "MARKET_UNAVAILABLE",
      message: invalidCursor ? error.message : "Could not load market history.",
    }, {
      status: invalidCursor ? 400 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
