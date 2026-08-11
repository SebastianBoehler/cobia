import { NextResponse } from "next/server";
import type { Hash } from "viem";
import { z } from "zod";
import { executionApiError } from "../../../../../../lib/execution-v2/execution-api-error";
import { getExecutionService } from "../../../../../../lib/runtime/execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
  routeId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  attemptId: z.string().uuid(),
});
const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submitted"),
    ordinal: z.number().int().nonnegative(),
    transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
      .transform((value) => value.toLowerCase() as Hash),
  }).strict(),
  z.object({ action: z.literal("resolve"), ordinal: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("recover"), ordinal: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("arm"), ordinal: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("cancel"), ordinal: z.number().int().nonnegative() }).strict(),
]);

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bearer(request: Request) {
  const value = request.headers.get("Authorization");
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  return match?.[1];
}

async function input(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]/executions/[attemptId]">,
): Promise<
  | { response: Response }
  | { routeId: string; attemptId: string; token: string }
> {
  const params = ParamsSchema.safeParse(await context.params);
  const token = bearer(request);
  if (!params.success) return { response: json({
    code: "INVALID_EXECUTION_ID",
    message: "Execution route or attempt id is invalid.",
  }, 400) };
  if (!token) return { response: json({
    code: "EXECUTION_AUTH_REQUIRED",
    message: "A scoped execution session is required.",
  }, 401) };
  return { ...params.data, token };
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]/executions/[attemptId]">,
): Promise<Response> {
  const parsed = await input(request, context);
  if ("response" in parsed) return parsed.response;
  try {
    return json(await getExecutionService().read(parsed.routeId, parsed.attemptId, parsed.token));
  } catch (error) {
    const clientError = executionApiError(error);
    return json({ code: clientError.code, message: clientError.message }, clientError.status);
  }
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/routes/[routeId]/executions/[attemptId]">,
): Promise<Response> {
  const parsed = await input(request, context);
  if ("response" in parsed) return parsed.response;
  let action: z.infer<typeof ActionSchema>;
  try {
    action = ActionSchema.parse(await request.json());
  } catch {
    return json({ code: "INVALID_EXECUTION_ACTION", message: "Execution action is malformed." }, 400);
  }
  try {
    return json(await getExecutionService().advance(
      parsed.routeId,
      parsed.attemptId,
      parsed.token,
      action,
    ));
  } catch (error) {
    const clientError = executionApiError(error);
    return json({ code: clientError.code, message: clientError.message }, clientError.status);
  }
}
