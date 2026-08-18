import { NextResponse } from "next/server";
import { z } from "zod";
import { CommerceAuthorizationErrorV1 } from "../../../../../../lib/commerce/authorization-service";
import { authorizeProductionCommercePlacementV1 } from "../../../../../../lib/runtime/commerce-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  template: z.record(z.string(), z.unknown()),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

const statusByCode = {
  PLACEMENT_NOT_FOUND: 404,
  PLACEMENT_MISMATCH: 403,
  SETTLEMENT_ALREADY_ATTEMPTED: 409,
  SETTLEMENT_UNCERTAIN: 409,
} as const;

export async function POST(
  request: Request,
  context: RouteContext<"/api/commerce/placements/[placementId]/authorization">,
): Promise<Response> {
  try {
    const { placementId } = await context.params;
    const body = BodySchema.parse(await request.json());
    const result = await authorizeProductionCommercePlacementV1({ placementId, ...body });
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CommerceAuthorizationErrorV1) {
      return NextResponse.json({ code: error.code, message: error.message }, {
        status: statusByCode[error.code],
      });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({
        code: "INVALID_REQUEST", message: "The commerce authorization request is invalid.",
      }, { status: 400 });
    }
    return NextResponse.json({
      code: "AUTHORIZATION_UNAVAILABLE", message: "Commerce authorization is temporarily unavailable.",
    }, { status: 503 });
  }
}
