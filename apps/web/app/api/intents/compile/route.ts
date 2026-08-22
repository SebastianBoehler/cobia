import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpenAiIntentCompiler } from "../../../../lib/intents/intent-compiler";
import { ACTION_PREFERENCES } from "../../../../lib/intents/intent-controls";
import { getAddress, isAddressEqual, type Address } from "viem";
import { isSameOrigin, walletSessionToken } from "../../../../lib/wallet-auth/http";
import {
  getWalletAuthService, walletAuthClientKey,
} from "../../../../lib/runtime/wallet-auth";
import { WalletSessionRejectedError } from "../../../../lib/wallet-auth/service";
import { getSolverProfileRepository } from "../../../../lib/runtime/market";
import { currentUnixSeconds } from "../../../../lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RequestSchema = z.object({
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
    .transform((value) => getAddress(value).toLowerCase() as Address),
  goal: z.string().trim().min(3).max(500),
  actionPreference: z.enum(ACTION_PREFERENCES.map(({ id }) => id)),
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST", message: "Intent compilation must start from this site." }, { status: 403 });
  }
  const token = walletSessionToken(request);
  if (!token) {
    return NextResponse.json({ code: "WALLET_AUTH_REQUIRED", message: "Verify wallet control before compiling an intent." }, { status: 401 });
  }
  const auth = getWalletAuthService();
  let leaseId: string | undefined;
  try {
    const { owner, goal, actionPreference } = RequestSchema.parse(await request.json());
    let session;
    try {
      session = await auth.readSession(token);
      if (!isAddressEqual(session.owner, owner)) {
        throw new WalletSessionRejectedError("Wallet session owner changed");
      }
    } catch (error) {
      if (error instanceof WalletSessionRejectedError) {
        return NextResponse.json({ code: "WALLET_AUTH_REQUIRED", message: "Verify wallet control before compiling an intent." }, { status: 401 });
      }
      throw error;
    }
    const admission = await auth.beginCompilation({ owner: session.owner,
      clientKey: walletAuthClientKey(request), goal, actionPreference });
    if (admission.kind === "cached") {
      return NextResponse.json(admission.result, { headers: { "Cache-Control": "no-store" } });
    }
    if (admission.kind === "limited") {
      return NextResponse.json({ code: "COMPILER_RATE_LIMITED", message: "Too many intent compilations. Try again shortly." }, {
        status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      });
    }
    if (admission.kind === "busy") {
      return NextResponse.json({ code: "COMPILER_BUSY", message: "This wallet already has an intent compilation in progress." }, {
        status: 409, headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      });
    }
    leaseId = admission.id;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Intent compiler API key is unavailable");
    const model = process.env.OPENAI_INTENT_MODEL ?? process.env.OPENAI_CODING_AGENT_MODEL ??
      process.env.OPENAI_SOLVER_MODEL ?? "gpt-5.6-terra";
    const compositionAvailable = await getSolverProfileRepository().supportsCapability(
      "policy.capability-composition@1", currentUnixSeconds(),
    );
    const result = await createOpenAiIntentCompiler({
      apiKey, model, compositionAvailable,
    }).compile(goal, actionPreference);
    await auth.completeCompilation(leaseId, result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (leaseId) await auth.failCompilation(leaseId).catch(() => undefined);
    const invalid = error instanceof z.ZodError;
    if (!invalid) console.error("Intent compilation failed", error);
    return NextResponse.json({
      code: invalid ? "INVALID_GOAL" : "INTENT_COMPILER_UNAVAILABLE",
      message: invalid ? "Describe a goal between 3 and 500 characters."
        : "The policy draft could not be compiled. Try again.",
    }, { status: invalid ? 400 : 503 });
  }
}
