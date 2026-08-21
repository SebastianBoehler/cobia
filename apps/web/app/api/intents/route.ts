import { OpenIntentPolicyV3Schema, commitment, parseOpenIntentPolicyV3 } from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "../../../lib/intents/signature";
import { PUBLIC_CACHE_10_SECONDS } from "../../../lib/http/cache-policy";
import {
  getIntentRepository,
  OwnerBalanceRequiredError,
  publishOpenIntent,
} from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  policy: OpenIntentPolicyV3Schema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

class InvalidOwnerSignatureError extends Error {}

export async function GET(): Promise<Response> {
  const observedAt = Math.floor(Date.now() / 1_000);
  try {
    const rows = await getIntentRepository().listDiscoverWithSnapshots(observedAt);
    const intents = rows.map(({ intent: row, snapshot }) => {
      return {
        id: row.id,
        policy: OpenIntentPolicyV3Schema.parse(row.policy),
        policyHash: row.policyHash,
        ownerSignature: row.ownerSignature,
        snapshot: snapshot.snapshot,
        snapshotHash: snapshot.snapshotHash,
        competitionClosesAt: Math.floor(row.competitionClosesAt.getTime() / 1_000),
        links: {
          intent: `/api/intents/${row.id}`,
          decisions: `/api/intents/${row.id}/decisions`,
        },
      };
    });
    return NextResponse.json({ observedAt, intents }, {
      headers: { "Cache-Control": PUBLIC_CACHE_10_SECONDS },
    });
  } catch {
    return NextResponse.json({
      code: "INTENT_LIST_FAILED",
      message: "Fresh intents could not be listed.",
    }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let intentId = "unparsed";
  try {
    const body = RequestBodySchema.parse(await request.json());
    intentId = body.policy.requestId;
    const observedAtSec = Math.floor(Date.now() / 1_000);
    const policy = parseOpenIntentPolicyV3(body.policy, observedAtSec);
    try {
      await verifyPolicyOwnerSignature(policy, body.ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const ownerSignature = body.ownerSignature as Hex;
    await publishOpenIntent({ policy, ownerSignature });
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
    const balanceRequired = error instanceof OwnerBalanceRequiredError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT"
        : invalidSignature ? "INVALID_SIGNATURE"
          : balanceRequired ? "OWNER_BALANCE_REQUIRED" : "INTENT_UNAVAILABLE",
      message: invalid ? "The signed general intent is invalid."
        : invalidSignature ? "The owner signature is invalid."
          : balanceRequired
            ? "The owner needs a positive native balance on every execution chain."
            : "The intent could not be published.",
      intentId,
    }, { status: invalid || invalidSignature ? 400 : balanceRequired ? 409 : 503 });
  }
}
