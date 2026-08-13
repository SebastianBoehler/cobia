import { defineSandboxProxy } from "@vercel/sandbox";
import { readCodingAgentRpcProxyConfig } from "@/lib/env";
import { getAgentProgramRepository } from "@/lib/runtime/market";
import { handleCodingAgentRpcProxy } from "@/lib/coding-agent-sandbox/rpc-proxy-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = defineSandboxProxy(async (request, meta) => {
  const config = readCodingAgentRpcProxyConfig();
  return handleCodingAgentRpcProxy(request, meta, {
    expectedHost: new URL(config.CODING_AGENT_PUBLIC_ORIGIN).host,
    expectedTeamId: config.VERCEL_TEAM_ID,
    expectedProjectId: config.VERCEL_PROJECT_ID,
    upstreamUrl: config.XLAYER_RPC_URL,
    readJob: (id) => getAgentProgramRepository().getBrokerAnchor(id),
  });
});
