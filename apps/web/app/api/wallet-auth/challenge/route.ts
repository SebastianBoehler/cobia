import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "../../../../lib/wallet-auth/http";
import { getWalletAuthService } from "../../../../lib/runtime/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST", message: "Wallet authentication must start from this site." }, { status: 403 });
  }
  try {
    const { owner } = RequestSchema.parse(await request.json());
    const challenge = await getWalletAuthService().issueChallenge({
      owner, origin: new URL(request.url).origin, chainId: 196,
    });
    return NextResponse.json(challenge, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({
      code: invalid ? "INVALID_WALLET" : "WALLET_AUTH_UNAVAILABLE",
      message: invalid ? "Connect a valid EVM wallet." : "Wallet authentication is unavailable.",
    }, { status: invalid ? 400 : 503 });
  }
}
