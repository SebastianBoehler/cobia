import { NextResponse } from "next/server";
import { resolveRequestNetwork } from "../../../../lib/network/site-network";
import { readMainnetAccessStatus } from "../../../../lib/network/read-mainnet-access-status";
import { readTestnetDeploymentStatus } from "../../../../lib/network/read-testnet-status";
import { PUBLIC_CACHE_10_SECONDS } from "../../../../lib/http/cache-policy";
import { readGeneralAssetLaunchStatus } from "../../../../lib/network/general-asset-launch-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const network = resolveRequestNetwork(request);
    const status = network.mode === "testnet"
      ? await readTestnetDeploymentStatus()
      : { ...await readMainnetAccessStatus(),
        v4: await readGeneralAssetLaunchStatus().catch(() => ({
          state: "unavailable" as const, activationAt: 0,
        })) };
    return NextResponse.json(status, {
      headers: { "Cache-Control": PUBLIC_CACHE_10_SECONDS },
    });
  } catch {
    return NextResponse.json({
      code: "NETWORK_RPC_UNAVAILABLE",
      message: "X Layer status is temporarily unavailable.",
    }, { status: 503 });
  }
}
