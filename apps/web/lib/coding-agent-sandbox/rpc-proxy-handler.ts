import { z } from "zod";
import { createCodingAgentReadOnlyRpcBroker } from "./read-only-rpc-broker";

const MAX_BODY_BYTES = 64 * 1_024;
const JobIdSchema = z.string().uuid();
const RequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string().max(128), z.number().int().safe(), z.null()]),
  method: z.string().min(1).max(128),
  params: z.array(z.unknown()).max(64),
}).strict();

export interface CodingAgentRpcProxyMeta {
  host: string;
  teamId: string;
  projectId: string;
  sandboxId: string;
  sandboxName: string;
}

export interface CodingAgentRpcProxyDependencies {
  expectedHost: string;
  expectedTeamId: string;
  expectedProjectId: string;
  upstreamUrl: string;
  readJob(id: string): Promise<{ state: string; blockNumber: string } | null>;
  fetcher?: typeof fetch;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function error(id: string | number | null, message: string, status: number) {
  return json({ jsonrpc: "2.0", id, error: { code: -32_000, message } }, status);
}

function jobIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return JobIdSchema.parse(parts.at(-1));
}

/** Handles an already OIDC-verified Vercel Sandbox forwarded request. */
export async function handleCodingAgentRpcProxy(
  request: Request,
  meta: CodingAgentRpcProxyMeta,
  dependencies: CodingAgentRpcProxyDependencies,
): Promise<Response> {
  if (meta.host !== dependencies.expectedHost ||
    meta.teamId !== dependencies.expectedTeamId ||
    meta.projectId !== dependencies.expectedProjectId) {
    return error(null, "Sandbox identity is not authorized", 403);
  }
  if (request.headers.has("authorization") || request.headers.has("cookie") ||
    request.headers.has("x-api-key")) {
    return error(null, "Credential-bearing RPC requests are forbidden", 400);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return error(null, "RPC request is too large", 413);
  }
  let jobId: string;
  try {
    jobId = jobIdFrom(request);
  } catch {
    return error(null, "Agent program job is invalid", 400);
  }
  if (meta.sandboxName !== `cobia-${jobId}`) {
    return error(null, "Sandbox is not bound to this job", 403);
  }
  const job = await dependencies.readJob(jobId);
  if (!job || job.state !== "running") {
    return error(null, "Agent program job is not running", 409);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return error(null, "RPC request is too large", 413);
  }
  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(JSON.parse(raw));
  } catch {
    return error(null, "RPC request is invalid", 400);
  }
  try {
    const broker = createCodingAgentReadOnlyRpcBroker({
      upstreamUrl: dependencies.upstreamUrl,
      blockTag: `0x${BigInt(job.blockNumber).toString(16)}`,
      fetch: dependencies.fetcher,
    });
    const result = await broker.request({ method: parsed.method, params: parsed.params });
    if (parsed.method.toLowerCase() === "eth_chainid" && result !== "0xc4") {
      throw new Error("Upstream RPC is not X Layer mainnet");
    }
    return json({ jsonrpc: "2.0", id: parsed.id, result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Brokered RPC failed";
    return error(parsed.id, message, 400);
  }
}
