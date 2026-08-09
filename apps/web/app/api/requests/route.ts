import { commitment, StablecoinPolicySchema } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "@/lib/intents/signature";
import { openQuoteMarket } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestBodySchema = z.object({
  policy: StablecoinPolicySchema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(request: Request): Promise<Response> {
  let requestId = "unparsed";
  try {
    const { policy, ownerSignature } = RequestBodySchema.parse(await request.json());
    requestId = policy.requestId;
    await verifyPolicyOwnerSignature(policy, ownerSignature as Hex);
    const result = await openQuoteMarket(policy);
    return NextResponse.json({
      requestId,
      policyHash: commitment(policy),
      quoteCount: result.quotes.length,
      failureCount: result.failures.length,
    }, { status: 201 });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    const invalidSignature = error instanceof Error && error.message.includes("signature");
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT" : invalidSignature ? "INVALID_SIGNATURE" : "MARKET_UNAVAILABLE",
      message: invalid ? "The yield intent is invalid." : error instanceof Error ? error.message : "The quote market failed.",
      requestId,
    }, { status: invalid || invalidSignature ? 400 : 503 });
  }
}
