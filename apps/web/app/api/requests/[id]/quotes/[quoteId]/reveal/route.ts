import { commitment } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Address, Hash } from "viem";
import { buildWinnerCharge, readPaymentConfig } from "@/lib/payments/config";
import { createPaymentServer } from "@/lib/payments/server";
import { getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/requests/[id]/quotes/[quoteId]/reveal">,
): Promise<Response> {
  const { id, quoteId } = await context.params;
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(quoteId)) throw new Error("Invalid quote commitment");
    const requests = getRequestRepository();
    const publicRequest = await requests.getPublicRequest(id);
    const quote = publicRequest?.quotes.find((item) => item.quoteId === quoteId);
    if (!quote || publicRequest?.selectedQuoteId !== quoteId) {
      throw new Error("Reveal requires the selected quote");
    }
    const bundle = await requests.getSelectedBundleForPayment(id, quoteId);
    if (commitment(bundle) !== quoteId) throw new Error("Private bundle commitment mismatch");

    const config = readPaymentConfig();
    const payment = createPaymentServer(new URL(request.url).host, config.MPPX_SECRET_KEY);
    const result = await payment.charge(buildWinnerCharge({
      chainId: config.PAYMENT_CHAIN_ID,
      currency: config.PAYMENT_ASSET,
      solver: quote.solverAddress as Address,
      treasury: config.COBIA_TREASURY,
      quoteId: quoteId as Hash,
    }))(request);
    if (result.status === 402) return result.challenge;

    const paidResponse = result.withReceipt(NextResponse.json({
      requestId: id,
      quoteId,
      bundle,
    }));
    const receipt = paidResponse.headers.get("payment-receipt");
    if (!receipt) throw new Error("Payment settled without a receipt header");
    const receiptHash = commitment({ receipt });
    await requests.recordPayment(id, receiptHash);
    await requests.markRevealed(id);
    paidResponse.headers.set("X-Cobia-Receipt-Hash", receiptHash);
    return paidResponse;
  } catch (error) {
    return NextResponse.json({
      code: "REVEAL_REJECTED",
      message: error instanceof Error ? error.message : "Paid reveal failed.",
      requestId: id,
    }, { status: 409 });
  }
}
