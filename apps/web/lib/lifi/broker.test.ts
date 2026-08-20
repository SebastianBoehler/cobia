import { describe, expect, it, vi } from "vitest";
import { createLifiBrokerV1, type LifiFetchV1 } from "./broker";

const publicIp = "104.18.0.1";
const quote = { id: "quote:0", type: "lifi", tool: "layerswap" };

function response(body: unknown, overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(body)),
    ...overrides,
  };
}

describe("LI.FI read broker", () => {
  it("fetches only a declared endpoint with normalized query keys", async () => {
    const fetcher = vi.fn<LifiFetchV1>().mockResolvedValue(response(quote));
    const broker = createLifiBrokerV1({ fetcher, dnsResolver: async () => [publicIp] });
    const result = await broker.request({
      path: "/v1/quote",
      query: {
        fromChain: "196", toChain: "1", fromToken: "0x1111111111111111111111111111111111111111",
        toToken: "0x2222222222222222222222222222222222222222", fromAmount: "10000000",
        fromAddress: "0x3333333333333333333333333333333333333333",
        toAddress: "0x3333333333333333333333333333333333333333", slippage: "0.005",
      },
    });

    expect(result.value).toEqual(quote);
    expect(result.responseHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringMatching(/^https:\/\/li\.quest\/v1\/quote\?/),
      resolvedAddress: publicIp,
      timeoutMs: 10_000,
      maxBytes: 2_097_152,
      headers: { accept: "application/json", "user-agent": "Cobia-LIFI-Broker/1" },
    }));
  });

  it("blocks undeclared paths, query keys, methods, and credential-shaped values", async () => {
    const broker = createLifiBrokerV1({ fetcher: vi.fn(), dnsResolver: async () => [publicIp] });
    await expect(broker.request({ path: "/v1/advanced/routes", query: {} } as never)).rejects.toThrow();
    await expect(broker.request({ path: "/v1/quote", query: { apiKey: "secret" } } as never)).rejects.toThrow();
    await expect(broker.request({ path: "/v1/status", query: { txHash: "https://user:pass@evil.test" } } as never)).rejects.toThrow();
  });

  it("never forwards authorization, cookies, wallet handles, or RPC URLs", async () => {
    const fetcher = vi.fn<LifiFetchV1>().mockResolvedValue(response({ chains: [] }));
    const broker = createLifiBrokerV1({ fetcher, dnsResolver: async () => [publicIp] });
    await broker.request({ path: "/v1/chains", query: {} });
    expect(JSON.stringify(fetcher.mock.calls[0]?.[0])).not.toMatch(/authorization|cookie|private.?key|walletProvider|rpcUrl/i);
  });

  it("rejects private DNS, redirects, wrong content types, and response bombs", async () => {
    const cases = [
      { dnsResolver: async () => ["127.0.0.1"], fetcher: vi.fn<LifiFetchV1>() },
      { dnsResolver: async () => [publicIp], fetcher: vi.fn<LifiFetchV1>().mockResolvedValue(response({}, { status: 302 })) },
      { dnsResolver: async () => [publicIp], fetcher: vi.fn<LifiFetchV1>().mockResolvedValue(response({}, { headers: { "content-type": "text/html" } })) },
      { dnsResolver: async () => [publicIp], fetcher: vi.fn<LifiFetchV1>().mockResolvedValue(response({}, { body: Buffer.alloc(2_097_153) })) },
    ];
    for (const dependencies of cases) {
      const broker = createLifiBrokerV1(dependencies);
      await expect(broker.request({ path: "/v1/chains", query: {} })).rejects.toThrow();
    }
  });
});
