import { NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { verifyRouteAccessSignature } from "@/lib/intents/signature";
import { getPurchaseRepository, getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]">,
): Promise<Response> {
  const { routeId } = await context.params;
  try {
    const buyer = request.headers.get("x-cobia-buyer");
    const signature = request.headers.get("x-cobia-signature");
    const timestamp = Number(request.headers.get("x-cobia-timestamp"));
    const now = Math.floor(Date.now() / 1_000);
    if (!buyer || !isAddress(buyer) || !signature || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return NextResponse.json({ code: "PROOF_REQUIRED", message: "Sign route access with the buyer wallet." }, { status: 401 });
    }
    if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ code: "PROOF_EXPIRED", message: "Route access signature has expired." }, { status: 401 });
    }
    try {
      await verifyRouteAccessSignature(buyer, routeId, timestamp, signature as Hex);
    } catch {
      return NextResponse.json({ code: "PROOF_INVALID", message: "Route access signature is invalid." }, { status: 403 });
    }

    const purchase = await getPurchaseRepository().getPurchasedRoute(routeId, buyer);
    if (!purchase) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Purchased route not found for this wallet." }, { status: 404 });
    }
    const publicRequest = await getRequestRepository().getPublicRequest(purchase.requestId);
    if (!publicRequest) throw new Error("Purchased route request is unavailable");
    return NextResponse.json({ ...purchase, policy: publicRequest.policy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      code: "ROUTE_READ_FAILED",
      message: error instanceof Error ? error.message : "Could not load the purchased route.",
    }, { status: 503 });
  }
}
