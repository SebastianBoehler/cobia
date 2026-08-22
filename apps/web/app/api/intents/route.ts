import {
  CapabilityCompositionPolicyV1Schema,
  OpenIntentPolicyV3Schema,
  commitment,
  parseCapabilityCompositionPolicyV1,
  parseOpenIntentPolicyV3,
} from "@cobia/domain";
import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "../../../lib/intents/signature";
import { PUBLIC_CACHE_10_SECONDS } from "../../../lib/http/cache-policy";
import {
  getIntentRepository,
  IntentSnapshotUnavailableError,
  OwnerBalanceRequiredError,
  publishCapabilityCompositionIntent,
  publishOpenIntent,
} from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  policy: z.discriminatedUnion("kind", [
    OpenIntentPolicyV3Schema,
    CapabilityCompositionPolicyV1Schema,
  ]),
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
        policy: row.policy && typeof row.policy === "object" &&
          "kind" in row.policy && row.policy.kind === "capability-composition"
          ? CapabilityCompositionPolicyV1Schema.parse(row.policy)
          : OpenIntentPolicyV3Schema.parse(row.policy),
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
    const policy = body.policy.kind === "capability-composition"
      ? parseCapabilityCompositionPolicyV1(body.policy, observedAtSec)
      : parseOpenIntentPolicyV3(body.policy, observedAtSec);
    try {
      await verifyPolicyOwnerSignature(policy, body.ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const ownerSignature = body.ownerSignature as Hex;
    if (policy.kind === "capability-composition") {
      await publishCapabilityCompositionIntent({ policy, ownerSignature });
    } else {
      await publishOpenIntent({ policy, ownerSignature });
    }
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
    const snapshotUnavailable = error instanceof IntentSnapshotUnavailableError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT"
        : invalidSignature ? "INVALID_SIGNATURE"
          : balanceRequired ? "OWNER_BALANCE_REQUIRED"
            : snapshotUnavailable ? "INTENT_SNAPSHOT_UNAVAILABLE" : "INTENT_UNAVAILABLE",
      message: invalid ? "The signed intent is invalid."
        : invalidSignature ? "The owner signature is invalid."
          : balanceRequired
            ? "The owner needs a positive native balance on every execution chain."
            : snapshotUnavailable
              ? "Cobia could not capture a fresh X Layer market snapshot. Nothing was published; try again shortly."
              : "The intent could not be published.",
      intentId,
    }, { status: invalid || invalidSignature ? 400 : balanceRequired ? 409 : 503 });
  }
}
