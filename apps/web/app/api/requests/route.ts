import {
  PersistedStablecoinPolicySchema,
  commitment,
  parseStablecoinPolicy,
  parseStablecoinPolicyV2,
} from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "@/lib/intents/signature";
import { ProductRoutePolicyV2Schema } from "../../../lib/intents/route-policy-v2";
import { openQuoteMarket } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestBodySchema = z.object({
  policy: PersistedStablecoinPolicySchema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

class InvalidOwnerSignatureError extends Error {}

export async function POST(request: Request): Promise<Response> {
  let requestId = "unparsed";
  try {
    const { policy: policyInput, ownerSignature } = RequestBodySchema.parse(await request.json());
    requestId = policyInput.requestId;
    const nowSec = Math.floor(Date.now() / 1_000);
    const policy = policyInput.version === 1
      ? parseStablecoinPolicy(policyInput, nowSec)
      : ProductRoutePolicyV2Schema.parse(parseStablecoinPolicyV2(policyInput, nowSec));
    try {
      await verifyPolicyOwnerSignature(policy, ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const result = await openQuoteMarket(policy);
    return NextResponse.json({
      requestId,
      policyHash: commitment(policy),
      quoteCount: result.quotes.length,
      failureCount: result.failures.length,
    }, { status: 201 });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    const invalidSignature = error instanceof InvalidOwnerSignatureError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT" : invalidSignature ? "INVALID_SIGNATURE" : "MARKET_UNAVAILABLE",
      message: invalid
        ? "The yield intent is invalid."
        : invalidSignature
          ? "The owner signature is invalid."
          : "The route market is temporarily unavailable.",
      requestId,
    }, { status: invalid || invalidSignature ? 400 : 503 });
  }
}
