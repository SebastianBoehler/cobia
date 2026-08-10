import { NextResponse } from "next/server";
import { getMarketRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const markets = await getMarketRepository().listMarkets(Math.floor(Date.now() / 1_000));
    return NextResponse.json({ markets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      code: "MARKETS_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Could not load Earn markets.",
    }, { status: 503 });
  }
}
