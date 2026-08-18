import { GeneralIntentPolicyV2Schema, commitment, parseGeneralIntentPolicyV2 } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "../../../lib/intents/signature";
import { scheduleAfterResponse } from "../../../lib/runtime/after-response";
import {
  ActiveManifestMismatchError,
  openGeneralIntentMarket,
  publishGeneralIntent,
} from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  policy: GeneralIntentPolicyV2Schema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

class InvalidOwnerSignatureError extends Error {}

export async function POST(request: Request): Promise<Response> {
  let intentId = "unparsed";
  try {
    const body = RequestBodySchema.parse(await request.json());
    intentId = body.policy.requestId;
    const observedAtSec = Math.floor(Date.now() / 1_000);
    const policy = parseGeneralIntentPolicyV2(body.policy, observedAtSec);
    try {
      await verifyPolicyOwnerSignature(policy, body.ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const ownerSignature = body.ownerSignature as Hex;
    await publishGeneralIntent({ policy, ownerSignature });
    scheduleAfterResponse(() => openGeneralIntentMarket({
      policy,
      ownerSignature,
      revision: 1,
      observedAtSec,
    }));
    return NextResponse.json({
      intentId,
      policyHash: commitment(policy),
      state: "collecting",
      competitionClosesAt: policy.competition.closesAt,
      links: { intent: `/intents/${intentId}` },
    }, { status: 202 });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    const invalidSignature = error instanceof InvalidOwnerSignatureError;
    const manifestMismatch = error instanceof ActiveManifestMismatchError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT"
        : invalidSignature ? "INVALID_SIGNATURE"
          : manifestMismatch ? "MANIFEST_MISMATCH" : "INTENT_UNAVAILABLE",
      message: invalid ? "The signed general intent is invalid."
        : invalidSignature ? "The owner signature is invalid."
          : manifestMismatch ? "The active capability manifest changed; review and sign again."
            : "The intent could not be published.",
      intentId,
    }, { status: invalid || invalidSignature ? 400 : manifestMismatch ? 409 : 503 });
  }
}
