import { createHmac } from "node:crypto";
import { WALLET_SESSION_COOKIE } from "./service";

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function walletSessionToken(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === WALLET_SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

export function walletAuthClientKey(request: Request, secret: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", secret).update(`cobia-intent-compile:${client}`).digest("hex");
}
