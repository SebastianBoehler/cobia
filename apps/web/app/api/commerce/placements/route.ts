import { NextResponse } from "next/server";
import { z } from "zod";
import { CommercePlacementErrorV1 } from "../../../../lib/commerce/placement-service";
import { prepareProductionCommercePlacementV1 } from "../../../../lib/runtime/commerce-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ArtifactSchema = z.record(z.string(), z.unknown());
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
