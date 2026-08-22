import { NextResponse } from "next/server";
import { z } from "zod";
import { readProductionOkxAgentPaymentV1 } from "../../../../lib/runtime/okx-agent-payments";

export const runtime = "nodejs";

const RequestSchema = z.object({ reference: z.string().min(1).max(512) }).strict();
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
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
  } catch {
    return NextResponse.json({ code: "PAYMENT_LOOKUP_FAILED", message: "Payment lookup failed." }, {
      status: 422, headers: noStore,
    });
  }
}
