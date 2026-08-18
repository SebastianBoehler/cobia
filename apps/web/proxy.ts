import { NextResponse, type NextRequest } from "next/server";
import { networkAllowsPath, resolveSiteNetwork } from "./lib/network/site-network";

export function proxy(request: NextRequest): NextResponse {
  let network;
  try {
    const host = request.headers.get("host") ?? request.nextUrl.host;
    network = resolveSiteNetwork(host);
  } catch {
    return NextResponse.json({
      code: "UNRECOGNIZED_HOST",
      message: "This hostname is not configured for Cobia.",
    }, { status: 421 });
  }

  if (networkAllowsPath(network.mode, request.nextUrl.pathname)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({
      code: "NETWORK_UNAVAILABLE",
      message: "This product route is not available on X Layer Testnet.",
    }, { status: 409 });
  }
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel/|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
