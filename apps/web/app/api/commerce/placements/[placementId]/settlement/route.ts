import { NextResponse } from "next/server";
import { z } from "zod";
import { CommerceSettlementErrorV1 } from "../../../../../../lib/commerce/settlement-service";
import { confirmProductionCommerceSettlementV1 } from "../../../../../../lib/runtime/commerce-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ArtifactSchema = z.record(z.string(), z.unknown());
const BodySchema = z.object({
  plan: ArtifactSchema,
  template: ArtifactSchema,
  settlement: ArtifactSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

const statusByCode = {
  PLACEMENT_NOT_FOUND: 404,
  PLACEMENT_MISMATCH: 403,
  SETTLEMENT_PENDING: 409,
  SETTLEMENT_REJECTED: 422,
} as const;

export async function POST(
  request: Request,
  context: RouteContext<"/api/commerce/placements/[placementId]/settlement">,
): Promise<Response> {
  try {
    const { placementId } = await context.params;
    const body = BodySchema.parse(await request.json());
    const result = await confirmProductionCommerceSettlementV1({ placementId, ...body });
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CommerceSettlementErrorV1) {
      return NextResponse.json({
        code: error.code, message: error.message, details: error.details,
      }, { status: statusByCode[error.code] });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({
        code: "INVALID_REQUEST", message: "The commerce settlement request is invalid.",
      }, { status: 400 });
    }
    return NextResponse.json({
      code: "SETTLEMENT_UNAVAILABLE", message: "Commerce settlement verification is temporarily unavailable.",
    }, { status: 503 });
  }
}
