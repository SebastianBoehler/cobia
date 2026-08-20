import { NextResponse } from "next/server";
import { resolveRequestNetwork } from "../../../../lib/network/site-network";
import { readMainnetAccessStatus } from "../../../../lib/network/read-mainnet-access-status";
import { readTestnetDeploymentStatus } from "../../../../lib/network/read-testnet-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const network = resolveRequestNetwork(request);
    const status = network.mode === "testnet"
      ? await readTestnetDeploymentStatus()
      : await readMainnetAccessStatus();
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return NextResponse.json({
      code: "NETWORK_RPC_UNAVAILABLE",
      message: cause instanceof Error ? cause.message : "X Layer status read failed.",
    }, { status: 503 });
  }
}
