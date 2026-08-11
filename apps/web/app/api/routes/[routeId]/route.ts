import { NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { validatePurchasedRouteIntegrity } from "@/lib/db/purchased-route-artifact";
import { verifyRouteAccessSignature } from "@/lib/intents/signature";
import { readPaymentTermsConfig } from "@/lib/payments/config";
import {
  getPurchaseRepository,
  getRehearsalRepository,
  getRequestRepository,
} from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const MAX_PROOF_AGE_SEC = 300;

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]">,
): Promise<Response> {
  try {
    const { routeId } = await context.params;
    if (typeof routeId !== "string" || !HASH.test(routeId)) {
      return json({ code: "INVALID_ROUTE_ID", message: "Purchased quote id is invalid." }, 400);
    }

    const buyer = request.headers.get("x-cobia-buyer");
    const signature = request.headers.get("x-cobia-signature");
    const timestampHeader = request.headers.get("x-cobia-timestamp");
    if (
      !buyer || !isAddress(buyer)
      || !signature || !SIGNATURE.test(signature)
      || !timestampHeader || !/^(0|[1-9][0-9]*)$/.test(timestampHeader)
    ) {
      return json({
        code: "PROOF_REQUIRED",
        message: "Sign quote access with the buyer wallet.",
      }, 401);
    }

    const timestamp = Number(timestampHeader);
    const now = Math.floor(Date.now() / 1_000);
    if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_PROOF_AGE_SEC) {
      return json({
        code: "PROOF_EXPIRED",
        message: "Quote access signature has expired.",
      }, 401);
    }
    try {
      await verifyRouteAccessSignature(buyer, routeId, timestamp, signature as Hex);
    } catch {
      return json({
        code: "PROOF_INVALID",
        message: "Quote access signature is invalid.",
      }, 403);
    }

    const purchase = await getPurchaseRepository().getPurchasedRoute(routeId, buyer);
    if (!purchase) {
      return json({
        code: "NOT_FOUND",
        message: "Purchased quote not found for this wallet.",
      }, 404);
    }
    const publicRequest = await getRequestRepository().getPublicRequest(purchase.requestId);
    if (!publicRequest) throw new Error("Purchased quote request is unavailable");
    const artifact = validatePurchasedRouteIntegrity({
      purchase,
      policyInput: publicRequest.policy,
      snapshotInput: publicRequest.snapshot,
      expected: { routeId, buyer },
    });
    if (artifact.bundle.version !== 2) return json(artifact);
    const passed = await getRehearsalRepository().findPassed(routeId, routeId);
    return json({
      ...artifact,
      rehearsalRealm: readPaymentTermsConfig().PAYMENT_REALM,
      rehearsal: passed?.trace ? {
        id: passed.id,
        state: "passed" as const,
        trace: passed.trace,
      } : null,
    });
  } catch {
    return json({
      code: "ROUTE_READ_FAILED",
      message: "Could not load the purchased quote.",
    }, 503);
  }
}
