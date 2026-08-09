import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyQuoteSelectionSignature } from "@/lib/intents/signature";
import { getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SelectionSchema = z.object({
  quoteId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/requests/[id]/selection">,
): Promise<Response> {
  const { id } = await context.params;
  try {
    const { quoteId, ownerSignature } = SelectionSchema.parse(await request.json());
    const repository = getRequestRepository();
    const market = await repository.getPublicRequest(id);
    if (!market) throw new Error("Yield intent not found");
    await verifyQuoteSelectionSignature(
      market.policy.owner,
      id,
      quoteId,
      ownerSignature as Hex,
    );
    await repository.selectQuote(id, quoteId, Math.floor(Date.now() / 1_000));
    return NextResponse.json({
      requestId: id,
      quoteId,
      state: "selected",
      revealUrl: `/api/requests/${id}/quotes/${quoteId}/reveal`,
    });
  } catch (error) {
    return NextResponse.json({
      code: "SELECTION_REJECTED",
      message: error instanceof Error ? error.message : "Quote selection failed.",
      requestId: id,
    }, { status: 409 });
  }
}
