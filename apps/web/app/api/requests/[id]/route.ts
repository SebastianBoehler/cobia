import { NextResponse } from "next/server";
import { getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/requests/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  try {
    const result = await getRequestRepository().getPublicRequest(id);
    if (!result) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Yield intent not found.", requestId: id }, { status: 404 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      code: "READ_FAILED",
      message: error instanceof Error ? error.message : "Could not load yield intent.",
      requestId: id,
    }, { status: 503 });
  }
}
