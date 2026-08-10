import { NextResponse } from "next/server";
import { getMarketRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/markets/[marketId]">) {
  const { marketId } = await context.params;
  const market = await getMarketRepository().getMarket(marketId, Math.floor(Date.now() / 1_000));
  return market
    ? NextResponse.json(market, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ code: "NOT_FOUND", message: "Earn market not found." }, { status: 404 });
}
