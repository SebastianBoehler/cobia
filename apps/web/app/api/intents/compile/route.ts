import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpenAiIntentCompiler } from "../../../../lib/intents/intent-compiler";
import { ACTION_PREFERENCES } from "../../../../lib/intents/intent-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RequestSchema = z.object({
  goal: z.string().trim().min(3).max(500),
  actionPreference: z.enum(ACTION_PREFERENCES.map(({ id }) => id)),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const { goal, actionPreference } = RequestSchema.parse(await request.json());
    const apiKey = z.string().min(1).parse(process.env.OPENAI_API_KEY);
    const model = process.env.OPENAI_INTENT_MODEL ?? process.env.OPENAI_CODING_AGENT_MODEL ??
      process.env.OPENAI_SOLVER_MODEL ?? "gpt-5.6-terra";
    const result = await createOpenAiIntentCompiler({ apiKey, model }).compile(goal, actionPreference);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_GOAL" : "INTENT_COMPILER_UNAVAILABLE",
      message: invalid ? "Describe a goal between 3 and 500 characters."
        : "The policy draft could not be compiled. Try again.",
    }, { status: invalid ? 400 : 503 });
  }
}
