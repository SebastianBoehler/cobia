import { NextResponse } from "next/server";
import { z } from "zod";
import { getWalletAuthService } from "../../../../lib/runtime/wallet-auth";
import { isSameOrigin } from "../../../../lib/wallet-auth/http";
import {
  WALLET_SESSION_COOKIE, WALLET_SESSION_LIFETIME_SEC, WalletAuthenticationRejectedError,
} from "../../../../lib/wallet-auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST", message: "Wallet authentication must finish on this site." }, { status: 403 });
  }
  try {
    const session = await getWalletAuthService().authenticate(RequestSchema.parse(await request.json()));
    const response = NextResponse.json({ owner: session.owner, expiresAt: session.expiresAt }, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(WALLET_SESSION_COOKIE, session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
      path: "/", maxAge: WALLET_SESSION_LIFETIME_SEC, priority: "high",
    });
    return response;
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof WalletAuthenticationRejectedError;
    return NextResponse.json({
      code: error instanceof z.ZodError ? "INVALID_WALLET_AUTH"
        : invalid ? "WALLET_AUTH_REJECTED" : "WALLET_AUTH_UNAVAILABLE",
      message: error instanceof z.ZodError ? "The wallet authentication response is malformed."
        : invalid ? "The wallet signature was rejected or expired."
          : "Wallet authentication is unavailable.",
    }, { status: invalid ? 400 : 503 });
  }
}
