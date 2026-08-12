import { pinReadOnlyRpcRequest, type JsonRpcRequest } from "@cobia/solvers";

interface RpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

export function createCodingAgentReadOnlyRpcBroker(input: {
  upstreamUrl: string;
  blockTag: string;
  fetch?: typeof globalThis.fetch;
}) {
  const upstream = new URL(input.upstreamUrl);
  if (upstream.protocol !== "https:") throw new Error("Coding-agent upstream RPC must use HTTPS");
  const transport = input.fetch ?? globalThis.fetch;
  let id = 0;
  return {
    async request(request: JsonRpcRequest): Promise<unknown> {
      const pinned = pinReadOnlyRpcRequest(request, input.blockTag);
      const response = await transport(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, ...pinned }),
      });
      const body = await response.json() as RpcResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? `Brokered RPC failed (${response.status})`);
      }
      return body.result;
    },
  };
}
