import { NextResponse } from "next/server";
import { z } from "zod";
import { projectIntentResolution } from "../../../../lib/competitions/intent-resolution";
import {
  getIntentRepository,
  getSolverSubmissionRepository,
} from "../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

function publicSubmission(submission: {
  id: string; solverId: string; revision: number; programHash: string;
  presentationState: string; objective: unknown; failureCodes?: string[];
}) {
  return {
    id: submission.id,
    solverId: submission.solverId,
    revision: submission.revision,
    programHash: submission.programHash,
    presentationState: submission.presentationState,
    objective: submission.objective,
    failureCodes: submission.failureCodes ?? [],
    links: { program: `/programs/${submission.id}` },
  };
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/intents/[intentId]">,
): Promise<Response> {
  const { intentId: value } = await context.params;
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_INTENT_ID", message: "Intent id is invalid." }, { status: 400 });
  }
  try {
    const intent = await getIntentRepository().get(parsed.data);
    if (!intent) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Intent not found." }, { status: 404 });
    }
    const submissions = await getSolverSubmissionRepository()
      .listForIntent(parsed.data, Math.floor(Date.now() / 1_000));
    const resolution = projectIntentResolution(intent, [
      ...submissions.current,
      ...submissions.history,
    ]);
    return NextResponse.json({
      intent: {
        id: intent.id, owner: intent.owner, displayGoal: intent.displayGoal,
        policyHash: intent.policyHash, state: resolution.state,
        competitionClosesAt: intent.competitionClosesAt.toISOString(),
        selectedSubmissionId: resolution.selectedSubmissionId,
      },
      submissions: {
        current: submissions.current.map(publicSubmission),
        history: submissions.history.map(publicSubmission),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      code: "INTENT_READ_FAILED", message: "The intent could not be read.",
    }, { status: 503 });
  }
}
