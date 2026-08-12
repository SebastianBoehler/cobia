import { describe, expect, it } from "vitest";
import { createCodingAgentReadOnlyRpcBroker } from "./read-only-rpc-broker";

describe("coding-agent read-only RPC broker", () => {
  it("forwards only a normalized request pinned to the captured block", async () => {
    let body = "";
    const broker = createCodingAgentReadOnlyRpcBroker({
      upstreamUrl: "https://private-rpc.example/secret-not-for-agent",
      blockTag: "0x1234",
      fetch: async (_url, init) => {
        body = String(init?.body);
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" }), { status: 200 });
      },
    });
    await expect(broker.request({
      method: "eth_call",
      params: [{ to: "0x1111111111111111111111111111111111111111", data: "0x" }, "pending"],
    })).resolves.toBe("0x");
    expect(body).toContain('"method":"eth_call"');
    expect(body).toContain('"0x1234"');
    expect(body).not.toContain("secret-not-for-agent");
  });

  it("never forwards a send, wallet, or signing request", async () => {
    let forwarded = false;
    const broker = createCodingAgentReadOnlyRpcBroker({
      upstreamUrl: "https://private-rpc.example/key",
      blockTag: "0x1234",
      fetch: async () => { forwarded = true; return new Response("{}"); },
    });
    await expect(broker.request({ method: "ETH_SENDTRANSACTION", params: [] }))
      .rejects.toThrow("not available to coding agents");
    expect(forwarded).toBe(false);
  });
});
