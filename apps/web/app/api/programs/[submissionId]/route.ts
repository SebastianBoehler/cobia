import { NextResponse } from "next/server";
import { z } from "zod";
import { getSolverSubmissionRepository } from "../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

function count(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const entries = (value as Record<string, unknown>)[key];
  return Array.isArray(entries) ? entries.length : 0;
}

function publicArtifacts(
  artifacts: Array<{ kind: string; artifactHash: string; payload: unknown }>,
  executable: boolean,
) {
  return Object.fromEntries(artifacts.map((artifact) => {
    if (artifact.kind === "provenance") {
      return [artifact.kind, {
        artifactHash: artifact.artifactHash,
        summary: {
          commandCount: count(artifact.payload, "commands"),
          fileCount: count(artifact.payload, "files"),
          networkRequestCount: count(artifact.payload, "networkRequests"),
        },
      }];
    }
    if (artifact.kind === "authorization" && !executable) {
      return [artifact.kind, { artifactHash: artifact.artifactHash }];
    }
    return [artifact.kind, { artifactHash: artifact.artifactHash, payload: artifact.payload }];
  }));
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/programs/[submissionId]">,
): Promise<Response> {
  const { submissionId: value } = await context.params;
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_SUBMISSION_ID", message: "Program id is invalid." }, { status: 400 });
  }
  try {
    const submission = await getSolverSubmissionRepository()
      .read(parsed.data, Math.floor(Date.now() / 1_000));
    if (!submission) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Program not found." }, { status: 404 });
    }
    const executable = submission.presentationState === "current" && submission.state === "attested";
    return NextResponse.json({
      submission: {
        id: submission.id, solverId: submission.solverId, revision: submission.revision,
        programHash: submission.programHash, state: submission.presentationState,
        validUntil: submission.validUntil.toISOString(), blockNumber: submission.blockNumber,
        blockHash: submission.blockHash, failureCodes: submission.failureCodes,
        objective: submission.objective, executable,
      },
      artifacts: publicArtifacts(submission.artifacts, executable),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      code: "PROGRAM_READ_FAILED", message: "The solver program could not be read.",
    }, { status: 503 });
  }
}
