import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { resolveRequestNetwork } from "../../../../../lib/network/site-network";
import { readPortfolio } from "@/lib/portfolio/read-portfolio";
import { PUBLIC_CACHE_10_SECONDS_SHORT_STALE } from "../../../../../lib/http/cache-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/wallets/[address]/portfolio">) {
  const { address } = await context.params;
  if (!isAddress(address)) return NextResponse.json({ code: "INVALID_ADDRESS", message: "A valid EVM address is required." }, { status: 400 });
  try {
    const network = resolveRequestNetwork(request);
    const requestedChain = Number(new URL(request.url).searchParams.get("chainId") ?? network.chainId);
    if (requestedChain !== network.chainId) {
      return NextResponse.json({
        code: "INVALID_CHAIN",
        message: "The requested chain does not match this Cobia host.",
      }, { status: 400 });
    }
    return NextResponse.json(await readPortfolio(getAddress(address), network.chainId), {
      headers: { "Cache-Control": PUBLIC_CACHE_10_SECONDS_SHORT_STALE },
    });
  } catch {
    return NextResponse.json({
      code: "PORTFOLIO_UNAVAILABLE",
      message: "Portfolio sources are temporarily unavailable.",
    }, { status: 503 });
  }
}
