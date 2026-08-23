import {
  CapabilityCompositionPolicyV1Schema,
  GeneralAssetPolicyV1Schema,
  OpenIntentPolicyV3Schema,
  commitment,
  parseCapabilityCompositionPolicyV1,
  parseGeneralAssetPolicyV1,
  parseOpenIntentPolicyV3,
} from "@cobia/domain";
import { NextResponse } from "next/server";
import { GeneralAssetEvidenceArtifactV1Schema } from "@cobia/solvers";
import type { Hex } from "viem";
import { z } from "zod";
import { verifyPolicyOwnerSignature } from "../../../lib/intents/signature";
import { PUBLIC_CACHE_10_SECONDS } from "../../../lib/http/cache-policy";
import {
  getIntentRepository,
  GeneralAssetPublicUnavailableError,
  GeneralAssetRefreshRequiredError,
  IntentSnapshotUnavailableError,
  OwnerBalanceRequiredError,
  publishCapabilityCompositionIntent,
  publishGeneralAssetIntent,
  publishOpenIntent,
} from "../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  policy: z.discriminatedUnion("kind", [
    OpenIntentPolicyV3Schema,
    CapabilityCompositionPolicyV1Schema,
    GeneralAssetPolicyV1Schema,
  ]),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  compilationLeaseId: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  if (value.policy.kind === "general-asset" && !value.compilationLeaseId) {
    context.addIssue({ code: "custom", path: ["compilationLeaseId"],
      message: "General asset publication requires its compilation receipt" });
  }
});

class InvalidOwnerSignatureError extends Error {}

export async function GET(): Promise<Response> {
  const observedAt = Math.floor(Date.now() / 1_000);
  try {
    const repository = getIntentRepository();
    const [rows, generalAssetRows] = await Promise.all([
      repository.listDiscoverWithSnapshots(observedAt),
      repository.listDiscoverGeneralAssets(observedAt),
    ]);
    const openIntents = rows.map(({ intent: row, snapshot }) => {
      return { createdAtMs: row.createdAt.getTime(), intent: {
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
      } };
    });
    const generalAssetIntents = generalAssetRows.map((row) => {
      const policy = GeneralAssetPolicyV1Schema.parse(row.policy);
      const snapshot = GeneralAssetEvidenceArtifactV1Schema.parse(row.generalAssetEvidence);
      if (row.generalAssetEvidenceHash !== commitment(snapshot)) {
        throw new Error("General asset evidence commitment mismatch");
      }
      return { createdAtMs: row.createdAt.getTime(), intent: {
        id: row.id,
        policy,
        policyHash: row.policyHash,
        ownerSignature: row.ownerSignature,
        snapshot,
        snapshotHash: row.generalAssetEvidenceHash,
        competitionClosesAt: Math.floor(row.competitionClosesAt.getTime() / 1_000),
        links: { intent: `/api/intents/${row.id}`,
          decisions: `/api/intents/${row.id}/decisions` },
      } };
    });
    const intents = [...openIntents, ...generalAssetIntents]
      .sort((left, right) => right.createdAtMs - left.createdAtMs)
      .slice(0, 30)
      .map(({ intent }) => intent);
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
      : body.policy.kind === "general-asset"
        ? parseGeneralAssetPolicyV1(body.policy, observedAtSec)
        : parseOpenIntentPolicyV3(body.policy, observedAtSec);
    try {
      await verifyPolicyOwnerSignature(policy, body.ownerSignature as Hex);
    } catch {
      throw new InvalidOwnerSignatureError();
    }
    const ownerSignature = body.ownerSignature as Hex;
    if (policy.kind === "capability-composition") {
      await publishCapabilityCompositionIntent({ policy, ownerSignature });
    } else if (policy.kind === "general-asset") {
      await publishGeneralAssetIntent({ policy, ownerSignature,
        compilationLeaseId: body.compilationLeaseId! });
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
    const refreshRequired = error instanceof GeneralAssetRefreshRequiredError;
    const generalAssetUnavailable = error instanceof GeneralAssetPublicUnavailableError;
    return NextResponse.json({
      code: invalid ? "INVALID_INTENT"
        : invalidSignature ? "INVALID_SIGNATURE"
          : balanceRequired ? "OWNER_BALANCE_REQUIRED"
            : snapshotUnavailable ? "INTENT_SNAPSHOT_UNAVAILABLE"
              : refreshRequired ? "GENERAL_ASSET_REFRESH_REQUIRED"
                : generalAssetUnavailable ? "GENERAL_ASSET_PUBLIC_UNAVAILABLE" : "INTENT_UNAVAILABLE",
      message: invalid ? "The signed intent is invalid."
        : invalidSignature ? "The owner signature is invalid."
          : balanceRequired
            ? "The owner needs a positive native balance on every execution chain."
            : snapshotUnavailable
              ? "Cobia could not capture a fresh X Layer market snapshot. Nothing was published; try again shortly."
              : refreshRequired || generalAssetUnavailable ? error.message
                : "The intent could not be published.",
      intentId,
      ...(refreshRequired ? { refresh: { method: "POST", href: "/api/intents/compile" } } : {}),
    }, { status: invalid || invalidSignature ? 400 : balanceRequired || refreshRequired ? 409 : 503 });
  }
}
