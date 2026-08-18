import { GeneralIntentPolicyV1Schema, commitment, parseGeneralIntentPolicyV1 } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "../../../lib/intents/signature";
import { openGeneralIntentMarket } from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  policy: GeneralIntentPolicyV1Schema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

class InvalidOwnerSignatureError extends Error {}

export async function POST(request: Request): Promise<Response> {
  let requestId = "unparsed";
  try {
    const body = RequestBodySchema.parse(await request.json());
    requestId = body.policy.requestId;
    const policy = parseGeneralIntentPolicyV1(body.policy, Math.floor(Date.now() / 1_000));
    try {
      await verifyPolicyOwnerSignature(policy, body.ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const result = await openGeneralIntentMarket(policy);
    return NextResponse.json({
      requestId,
      policyHash: commitment(policy),
      agentProgramId: result.jobId,
    }, { status: 201 });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    const invalidSignature = error instanceof InvalidOwnerSignatureError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT" : invalidSignature ? "INVALID_SIGNATURE" : "MARKET_UNAVAILABLE",
      message: invalid
        ? "The signed general intent is invalid."
        : invalidSignature
          ? "The owner signature is invalid."
          : "The general solver market is temporarily unavailable.",
      requestId,
    }, { status: invalid || invalidSignature ? 400 : 503 });
  }
}
