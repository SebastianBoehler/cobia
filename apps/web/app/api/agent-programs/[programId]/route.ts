import { NextResponse } from "next/server";
import { getAgentProgramRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/agent-programs/[programId]">,
) {
  const { programId } = await context.params;
  try {
    const result = await getAgentProgramRepository().getExecutionContext(programId);
    if (!result) return NextResponse.json({ code: "NOT_FOUND", message: "Agent program not found." }, { status: 404 });
    const byKind = new Map(result.artifacts.map(({ kind, payload }) => [kind, payload]));
    const policy = result.policy as { deadline?: number; maxSnapshotAgeSec?: number };
    const snapshot = result.snapshot as { capturedAt?: string };
    const freshUntil = typeof snapshot.capturedAt === "string" && typeof policy.maxSnapshotAgeSec === "number"
      ? Math.floor(Date.parse(snapshot.capturedAt) / 1_000) + policy.maxSnapshotAgeSec
      : 0;
    const nowSec = Math.floor(Date.now() / 1_000);
    const live = result.state === "attested" && typeof policy.deadline === "number" &&
      nowSec < policy.deadline && nowSec <= freshUntil;
    return NextResponse.json({
      id: result.id,
      requestId: result.requestId,
      state: result.state,
      failureCode: result.failureCode,
      owner: result.owner,
      chainId: result.chainId,
      blockNumber: result.blockNumber,
      blockHash: result.blockHash,
      policy: result.policy,
      program: byKind.get("program") ?? null,
      verdict: byKind.get("verdict") ?? null,
      replay: byKind.get("replay") ?? null,
      provenance: byKind.get("provenance") ?? null,
      receipt: byKind.get("receipt") ?? null,
      validity: live ? "live" : "past-discovery",
      executable: live,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      code: "READ_FAILED",
      message: error instanceof Error ? error.message : "Could not read agent program.",
    }, { status: 503 });
  }
}
