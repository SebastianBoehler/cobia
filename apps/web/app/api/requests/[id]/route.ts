import { NextResponse } from "next/server";
import { activeQuoteFreshness } from "@/lib/markets/active-quotes";
import { readPaymentTermsConfig } from "@/lib/payments/config";
import { buildContextPaymentTerms } from "@/lib/payments/payment-context";
import { isCurrentPaymentTerms } from "@/lib/payments/terms";
import { getPaymentRepository, getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/requests/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  try {
    const nowSec = Math.floor(Date.now() / 1_000);
    const repository = getRequestRepository();
    const result = await repository.getPublicRequest(id, nowSec);
    if (!result) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Yield intent not found.", requestId: id }, { status: 404 });
    }
    let paymentRecovery = "none" as "none" | "resume" | "recover" | "reconcile";
    let attempt: Awaited<ReturnType<ReturnType<typeof getPaymentRepository>["getPaymentByRequest"]>>;
    if (result.state === "payment_pending" || result.state === "paid") {
      attempt = await getPaymentRepository().getPaymentByRequest(id);
      const currentTerms = isCurrentPaymentTerms(attempt?.paymentTerms);
      if (result.state === "payment_pending") {
        paymentRecovery = attempt?.state === "pending"
          && !attempt.credentialHash
          && currentTerms
          ? "resume"
          : "reconcile";
      } else {
        paymentRecovery = attempt?.state === "settled" || attempt?.state === "finalized"
          ? "recover"
          : "reconcile";
      }
    }
    let paymentTerms = paymentRecovery === "resume" || paymentRecovery === "recover"
      ? attempt?.paymentTerms
      : undefined;
    if (
      result.selectedQuoteId
      && !result.purchasedRouteId
      && paymentRecovery !== "reconcile"
      && !paymentTerms
    ) {
      const paymentContext = await repository.getPaymentContext(
        id,
        result.selectedQuoteId,
      );
      paymentTerms = buildContextPaymentTerms(
        paymentContext,
        readPaymentTermsConfig(),
      );
    }
    return NextResponse.json(
      {
        ...result,
        freshness: activeQuoteFreshness(result.quotes, nowSec),
        paymentRecovery,
        ...(paymentTerms ? { paymentTerms } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({
      code: "READ_FAILED",
      message: error instanceof Error ? error.message : "Could not load yield intent.",
      requestId: id,
    }, { status: 503 });
  }
}
