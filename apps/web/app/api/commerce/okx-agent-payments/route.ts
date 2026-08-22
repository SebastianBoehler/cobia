import { NextResponse } from "next/server";
import { z } from "zod";
import { OkxAgentPaymentErrorV1 } from "../../../../lib/commerce/okx-agent-payments";
import { readProductionOkxAgentPaymentV1 } from "../../../../lib/runtime/okx-agent-payments";
import { isSameOrigin } from "../../../../lib/wallet-auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const RequestSchema = z.object({ reference: z.string().min(1).max(512) }).strict();
const noStore = { "Cache-Control": "no-store" };
const errorStatus = {
  INVALID_REFERENCE: 400,
  PAYMENT_NOT_FOUND: 404,
  PROVIDER_REJECTED: 502,
  PROVIDER_RESPONSE_INVALID: 502,
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "ORIGIN_REJECTED", message: "Request origin is not allowed." }, {
      status: 403, headers: noStore,
    });
  }
  let input: z.infer<typeof RequestSchema>;
  try { input = RequestSchema.parse(await request.json()); } catch {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "A payment reference is required." }, {
      status: 400, headers: noStore,
    });
  }
  try {
    return NextResponse.json({ payment: await readProductionOkxAgentPaymentV1(input.reference) }, {
      headers: noStore,
    });
  } catch (error) {
    if (error instanceof OkxAgentPaymentErrorV1) {
      return NextResponse.json({ code: error.code, message: error.message }, {
        status: errorStatus[error.code], headers: noStore,
      });
    }
    return NextResponse.json({
      code: "PAYMENT_LOOKUP_UNAVAILABLE",
      message: "OKX Agent Payment lookup is temporarily unavailable.",
    }, { status: 503, headers: noStore });
  }
}
