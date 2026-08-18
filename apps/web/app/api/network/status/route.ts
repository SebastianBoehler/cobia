import { NextResponse } from "next/server";
import { resolveRequestNetwork } from "../../../../lib/network/site-network";
import { readTestnetDeploymentStatus } from "../../../../lib/network/read-testnet-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (resolveRequestNetwork(request).mode !== "testnet") {
      return NextResponse.json({ code: "NOT_FOUND", message: "Not found." }, { status: 404 });
    }
    return NextResponse.json(await readTestnetDeploymentStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return NextResponse.json({
      code: "TESTNET_RPC_UNAVAILABLE",
      message: cause instanceof Error ? cause.message : "X Layer Testnet status read failed.",
    }, { status: 503 });
  }
}
