import { NextResponse } from "next/server";
import { type Hex } from "viem";
import { z } from "zod";
import { executionApiError } from "../../../../../lib/execution-v2/execution-api-error";
import { ExecutionMainnetProofSchema } from "../../../../../lib/execution-v2/mainnet-proof";
import { getExecutionService } from "../../../../../lib/runtime/execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const StartBodySchema = z.object({
  proof: ExecutionMainnetProofSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]/executions">,
): Promise<Response> {
  const { routeId } = await context.params;
  const parsedRoute = HashSchema.safeParse(routeId);
  let body: z.infer<typeof StartBodySchema>;
  try {
    body = StartBodySchema.parse(await request.json());
  } catch {
    return json({
      code: "INVALID_EXECUTION_REQUEST",
      message: "Execution authorization is malformed.",
    }, 400);
  }
  if (!parsedRoute.success) {
    return json({ code: "INVALID_ROUTE_ID", message: "Purchased route id is invalid." }, 400);
  }
  try {
    return json(await getExecutionService().start(
      parsedRoute.data,
      body.proof,
      body.signature as Hex,
    ));
  } catch (error) {
    const clientError = executionApiError(error);
    return json({ code: clientError.code, message: clientError.message }, clientError.status);
  }
}
