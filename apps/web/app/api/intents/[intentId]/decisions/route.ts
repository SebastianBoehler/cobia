import { NextResponse } from "next/server";
import { z } from "zod";
import { SolverDecisionReplayError } from "../../../../../lib/db/solver-decision-claims";
import {
  InvalidSolverDecisionError,
  InvalidSolverDecisionSignatureError,
  SolverDecisionUnavailableError,
} from "../../../../../lib/open-exchange/decision-intake";
import { submitOpenSolverDecision } from "../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IdSchema = z.string().uuid();
const BodySchema = z.object({
  claim: z.object({ intentId: z.string().uuid() }).passthrough(),
  signature: z.string(),
  decision: z.unknown(),
}).strict();

export async function POST(
  request: Request,
  context: RouteContext<"/api/intents/[intentId]/decisions">,
): Promise<Response> {
  const { intentId: value } = await context.params;
  try {
    const intentId = IdSchema.parse(value);
    const body = BodySchema.parse(await request.json());
    if (body.claim.intentId !== intentId) {
      return NextResponse.json({
        code: "INTENT_MISMATCH", message: "Decision claim does not match this intent.",
      }, { status: 400 });
    }
    return NextResponse.json(await submitOpenSolverDecision(body), {
      status: 202, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const mapping = error instanceof InvalidSolverDecisionSignatureError
      ? ["INVALID_SIGNATURE", 400]
      : error instanceof InvalidSolverDecisionError || error instanceof z.ZodError
        ? ["INVALID_DECISION", 400]
        : error instanceof SolverDecisionReplayError
          ? ["DECISION_REPLAY", 409]
          : error instanceof SolverDecisionUnavailableError
            ? ["DECISION_UNAVAILABLE", 409]
            : ["DECISION_INTAKE_FAILED", 503];
    return NextResponse.json({ code: mapping[0], message: "Solver decision was not accepted." }, {
      status: mapping[1] as number,
    });
  }
}
