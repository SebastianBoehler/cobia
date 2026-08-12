import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { readPortfolio } from "@/lib/portfolio/read-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/wallets/[address]/portfolio">) {
  const { address } = await context.params;
  if (!isAddress(address)) return NextResponse.json({ code: "INVALID_ADDRESS", message: "A valid EVM address is required." }, { status: 400 });
  const requestedChain = Number(new URL(request.url).searchParams.get("chainId") ?? 196);
  if (requestedChain !== 196) {
    return NextResponse.json({ code: "INVALID_CHAIN", message: "Only X Layer mainnet is supported." }, { status: 400 });
  }
  try {
    return NextResponse.json(await readPortfolio(getAddress(address), requestedChain), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ code: "RPC_UNAVAILABLE", message: error instanceof Error ? error.message : "X Layer portfolio read failed." }, { status: 503 });
  }
}
