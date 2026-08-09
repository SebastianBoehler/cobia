import { createMcpHandler } from "@modelcontextprotocol/server";
import { createCobiaMcpServer } from "@/lib/mcp/server";
import { createMcpDependencies } from "@/lib/runtime/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(() => createCobiaMcpServer(createMcpDependencies()));

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

async function serve(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return new Response("Forbidden origin", { status: 403 });
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
