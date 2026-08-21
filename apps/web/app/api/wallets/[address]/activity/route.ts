import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getActivityRepository } from "@/lib/runtime/market";
import { PUBLIC_CACHE_10_SECONDS_SHORT_STALE } from "../../../../../lib/http/cache-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/wallets/[address]/activity">) {
  const { address } = await context.params;
  if (!isAddress(address)) return NextResponse.json({ code: "INVALID_ADDRESS", message: "A valid EVM address is required." }, { status: 400 });
  try {
    const events = await getActivityRepository().listActivity(address, 196);
    return NextResponse.json({ address, chainId: 196, events }, {
      headers: { "Cache-Control": PUBLIC_CACHE_10_SECONDS_SHORT_STALE },
    });
  } catch {
    return NextResponse.json({
      code: "ACTIVITY_UNAVAILABLE",
      message: "Wallet activity is temporarily unavailable.",
    }, { status: 503 });
  }
}
