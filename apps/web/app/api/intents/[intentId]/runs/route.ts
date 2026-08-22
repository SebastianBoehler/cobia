import { NextResponse } from "next/server";
import { z } from "zod";
import {
  InvalidSolverRunError, InvalidSolverRunSignatureError, SolverRunUnavailableError,
} from "../../../../../lib/open-exchange/run-intake";
import { startOpenSolverRun } from "../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();
const BodySchema = z.object({
  claim: z.object({ intentId: z.string().uuid() }).passthrough(),
  signature: z.string(),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/intents/[intentId]/runs">,
): Promise<Response> {
  const { intentId: value } = await context.params;
  try {
    const intentId = IdSchema.parse(value);
    const body = BodySchema.parse(await request.json());
    if (body.claim.intentId !== intentId) {
      return NextResponse.json({
        code: "INTENT_MISMATCH", message: "Run claim does not match this intent.",
      }, { status: 400 });
    }
    return NextResponse.json(await startOpenSolverRun(body), {
      status: 202, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const mapping = error instanceof InvalidSolverRunSignatureError
      ? ["INVALID_SIGNATURE", 400]
      : error instanceof InvalidSolverRunError || error instanceof z.ZodError
        ? ["INVALID_RUN", 400]
        : error instanceof SolverRunUnavailableError
          ? ["RUN_UNAVAILABLE", 409]
          : ["RUN_INTAKE_FAILED", 503];
    return NextResponse.json({ code: mapping[0], message: "Solver run was not accepted." }, {
      status: mapping[1] as number,
    });
  }
}
