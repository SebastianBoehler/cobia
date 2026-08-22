import { NextResponse } from "next/server";
import { z } from "zod";
import { CommercePlacementErrorV1 } from "../../../../lib/commerce/placement-service";
import {
  prepareProductionCommercePlacementV1,
  readProductionCommercePlacementStatusV1,
} from "../../../../lib/runtime/commerce-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ArtifactSchema = z.record(z.string(), z.unknown());
const PlacementIdSchema = z.string().uuid();
const BodySchema = z.object({
  policy: ArtifactSchema,
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  program: ArtifactSchema,
  evidence: ArtifactSchema,
}).strict();

const statusByCode = {
  INVALID_SIGNATURE: 403,
  OFFER_NOT_FOUND: 404,
  VERIFICATION_REJECTED: 422,
  PLACEMENT_MODE_UNAVAILABLE: 409,
} as const;

function tracking(state: "prepared" | "authorizing" | "submitted" | "confirmed" | "rejected") {
  switch (state) {
    case "prepared":
      return { status: "awaiting-authorization", message: "Cobia prepared this bounded purchase. No signed payment authorization has been accepted." };
    case "authorizing":
      return { status: "authorization-accepted", message: "Cobia accepted the signed authorization. Merchant acceptance and token transfer are not independently confirmed." };
    case "submitted":
      return { status: "settlement-submitted", message: "The merchant supplied a payment transaction. Cobia is awaiting independent receipt verification." };
    case "confirmed":
      return { status: "payment-settled", message: "Cobia independently verified the payment receipt." };
    case "rejected":
      return { status: "settlement-rejected", message: "Cobia rejected this purchase attempt; no settlement receipt was accepted." };
  }
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  const parsed = PlacementIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "A valid placement id is required." }, { status: 400 });
  }
  try {
    const placement = await readProductionCommercePlacementStatusV1(parsed.data);
    if (!placement) {
      return NextResponse.json({ code: "PLACEMENT_NOT_FOUND", message: "Commerce placement was not found." }, { status: 404 });
    }
    const transactionHash = placement.transactionHash;
    return NextResponse.json({
      placement: {
        id: placement.id, state: placement.state, updatedAt: placement.updatedAt.toISOString(),
        transactionHash, evidenceHash: placement.evidenceHash, rejectionCode: placement.rejectionCode,
      },
      tracking: {
        ...tracking(placement.state),
        onchainTransaction: transactionHash ? {
          hash: transactionHash,
          href: `https://web3.okx.com/explorer/xlayer/tx/${transactionHash}`,
        } : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      code: "PLACEMENT_UNAVAILABLE", message: "Commerce placement status is temporarily unavailable.",
    }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = BodySchema.parse(await request.json());
    const result = await prepareProductionCommercePlacementV1(body);
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CommercePlacementErrorV1) {
      return NextResponse.json({
        code: error.code, message: error.message, details: error.details,
      }, { status: statusByCode[error.code] });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({
        code: "INVALID_REQUEST", message: "The commerce placement request is invalid.",
      }, { status: 400 });
    }
    return NextResponse.json({
      code: "PLACEMENT_UNAVAILABLE", message: "Commerce placement is temporarily unavailable.",
    }, { status: 503 });
  }
}
