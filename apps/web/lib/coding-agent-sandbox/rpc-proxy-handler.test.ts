import { describe, expect, it, vi } from "vitest";
import { handleCodingAgentRpcProxy } from "./rpc-proxy-handler";

const jobId = "550e8400-e29b-41d4-a716-446655440000";
const meta = {
  host: "cobia.example",
  teamId: "team_1",
  projectId: "prj_1",
  sandboxId: "sbx_1",
  sandboxName: `cobia-${jobId}`,
};

function request(body: unknown, headers?: HeadersInit) {
  return new Request(`https://cobia.example/api/internal/coding-agent/rpc/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function dependencies() {
  return {
    expectedHost: "cobia.example",
    expectedTeamId: "team_1",
    expectedProjectId: "prj_1",
    upstreamUrl: "https://rpc.example/credential",
    readJob: vi.fn(async () => ({ state: "running", blockNumber: "4660" })),
    fetcher: vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0xc4" }));
    }),
  };
}

describe("coding-agent RPC proxy handler", () => {
  it("authenticates the exact sandbox job and pins a public read", async () => {
    const deps = dependencies();
    const response = await handleCodingAgentRpcProxy(request({
      jsonrpc: "2.0", id: 7, method: "eth_chainId", params: [],
    }), meta, deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 7, result: "0xc4" });
    expect(deps.readJob).toHaveBeenCalledWith(jobId);
    expect(String(deps.fetcher.mock.calls[0]?.[1]?.body)).not.toContain("credential");
  });

  it.each([
    ["wrong project", { ...meta, projectId: "prj_other" }],
    ["wrong team", { ...meta, teamId: "team_other" }],
    ["wrong sandbox", { ...meta, sandboxName: "cobia-other" }],
    ["wrong host", { ...meta, host: "evil.example" }],
  ])("rejects %s before touching RPC", async (_label, candidate) => {
    const deps = dependencies();
    const response = await handleCodingAgentRpcProxy(request({
      jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [],
    }), candidate, deps);
    expect(response.status).toBe(403);
    expect(deps.fetcher).not.toHaveBeenCalled();
  });

  it("rejects batches, mutations, resolved jobs, and caller authorization headers", async () => {
    const cases: [Request, ReturnType<typeof dependencies>][] = [
      [request([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }]), dependencies()],
      [request({ jsonrpc: "2.0", id: 1, method: "ETH_SENDTRANSACTION", params: [] }), dependencies()],
      [request({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }, { Authorization: "Bearer stolen" }), dependencies()],
    ];
    const resolved = dependencies();
    resolved.readJob.mockResolvedValueOnce({ state: "attested", blockNumber: "4660" });
    cases.push([request({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), resolved]);

    for (const [candidate, deps] of cases) {
      const response = await handleCodingAgentRpcProxy(candidate, meta, deps);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(deps.fetcher).not.toHaveBeenCalled();
    }
  });
});
