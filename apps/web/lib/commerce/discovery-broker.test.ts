import { describe, expect, it, vi } from "vitest";
import { discoverCommerceOffersV1, type CommerceFetchV1 } from "./discovery-broker";
import { x402PaymentRequiredCommitmentV1 } from "./x402-wire";

const bazaarUrl = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=20";
const publicIp = "104.18.34.226";
const payee = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";

const bazaar = {
  x402Version: 2,
  items: [{
    resource: "https://merchant.example/api/coffee",
    type: "http",
    x402Version: 2,
    accepts: [{
      scheme: "exact",
      network: "eip155:196",
      amount: "12500000",
      asset: asset as `0x${string}`,
      payTo: payee as `0x${string}`,
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: "eip3009" },
    }],
    lastUpdated: "2026-08-18T18:00:00.000Z",
    metadata: { description: "One bag of coffee" },
    serviceName: "Example Merchant",
  }],
  pagination: { limit: 20, offset: 0, total: 1 },
};

const bazaarRequired = {
  x402Version: 2 as const,
  resource: {
    url: bazaar.items[0]!.resource,
    description: bazaar.items[0]!.metadata.description,
    serviceName: bazaar.items[0]!.serviceName,
  },
  accepts: bazaar.items[0]!.accepts,
  extensions: {},
};

const resourceRequired = {
  x402Version: 2 as const,
  resource: {
    url: "https://api.agentstools.dev/crypto/news",
    description: "Aggregated crypto news with sentiment",
    serviceName: "crypto-news",
    tags: ["crypto", "news", "sentiment", "bitcoin", "ethereum", "headlines"],
  },
  accepts: bazaar.items[0]!.accepts,
  extensions: {},
};

function response(body: unknown, overrides: Partial<Awaited<ReturnType<CommerceFetchV1>>> = {}) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(body)),
    ...overrides,
  };
}

const source = {
  id: "cdp-x402-bazaar",
  protocol: "x402-bazaar" as const,
  url: bazaarUrl,
  trustedResources: {},
};

const resourceSource = {
  id: "agent-tools-crypto-news",
  protocol: "x402-resource" as const,
  url: "https://api.agentstools.dev/crypto/news",
  trustedResources: {
    "https://api.agentstools.dev/crypto/news": {
      manifestHash: `0x${"44".repeat(32)}` as const,
      merchantDisplayName: "Agent Tools",
      productCommitment: x402PaymentRequiredCommitmentV1(resourceRequired),
    },
  },
};

describe("commerce discovery broker", () => {
  it("fetches a reviewed Bazaar source and returns immutable discovery-only offers", async () => {
    const fetcher = vi.fn<CommerceFetchV1>().mockResolvedValue(response(bazaar));
    const result = await discoverCommerceOffersV1({
      sources: [source],
      dnsResolver: async () => [publicIp],
      fetcher,
      nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
    });

    expect(result.sourceErrors).toEqual([]);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.eligibility).toEqual({
      status: "discovery-only",
      blockedReason: "MERCHANT_UNREGISTERED",
    });
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      url: bazaarUrl,
      resolvedAddress: publicIp,
      headers: { accept: "application/json", "user-agent": "Cobia-Commerce-Discovery/1" },
    }));
  });

  it("marks only an exactly pinned resource executable before wallet binding", async () => {
    const fetcher = vi.fn<CommerceFetchV1>().mockResolvedValue(response(bazaar));
    const result = await discoverCommerceOffersV1({
      sources: [{ ...source, trustedResources: {
        "https://merchant.example/api/coffee": {
          manifestHash: `0x${"44".repeat(32)}`,
          merchantDisplayName: "Example Merchant",
          productCommitment: x402PaymentRequiredCommitmentV1(bazaarRequired),
        },
      } }],
      dnsResolver: async () => [publicIp], fetcher, nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
    });

    expect(result.sourceErrors).toEqual([]);
    expect(result.offers[0]).toMatchObject({
      evidence: { receiptRecipient: "0x0000000000000000000000000000000000000000" },
      eligibility: { status: "executable" },
    });
  });

  it("discovers a pinned resource from its live x402 challenge", async () => {
    const fetcher = vi.fn<CommerceFetchV1>().mockResolvedValue(response({}, {
      status: 402,
      headers: {
        "content-type": "application/json",
        "payment-required": Buffer.from(JSON.stringify(resourceRequired)).toString("base64"),
      },
    }));
    const result = await discoverCommerceOffersV1({
      sources: [resourceSource], dnsResolver: async () => [publicIp], fetcher,
      nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
    });

    expect(result.sourceErrors).toEqual([]);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      merchant: { displayName: "Agent Tools" },
      product: { name: "crypto news", description: "Aggregated crypto news with sentiment" },
      eligibility: { status: "executable" },
    });
  });

  it("never sends cookies, authorization, wallet, or RPC data", async () => {
    const fetcher = vi.fn<CommerceFetchV1>().mockResolvedValue(response(bazaar));
    await discoverCommerceOffersV1({
      sources: [source],
      dnsResolver: async () => [publicIp],
      fetcher,
      nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
    });
    const request = fetcher.mock.calls[0]?.[0];
    expect(JSON.stringify(request)).not.toMatch(/authorization|cookie|wallet|rpc/i);
  });

  it("revalidates redirects and blocks private redirect targets", async () => {
    const fetcher = vi.fn<CommerceFetchV1>().mockResolvedValue({
      status: 302,
      headers: { location: "https://127.0.0.1/catalog" },
      body: new Uint8Array(),
    });
    const result = await discoverCommerceOffersV1({
      sources: [source],
      dnsResolver: async (hostname) => hostname === "127.0.0.1" ? ["127.0.0.1"] : [publicIp],
      fetcher,
      nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
    });
    expect(result.offers).toEqual([]);
    expect(result.sourceErrors[0]?.code).toBe("DISCOVERY_NETWORK_BLOCKED");
  });

  it("reports source-specific failures without fabricating offers", async () => {
    const cases = [
      response(bazaar, { status: 500 }),
      response(bazaar, { headers: { "content-type": "text/html" } }),
      response({ ...bazaar, x402Version: 1 }),
      response(bazaar, { body: Buffer.alloc(1_048_577) }),
    ];
    for (const item of cases) {
      const result = await discoverCommerceOffersV1({
        sources: [source],
        dnsResolver: async () => [publicIp],
        fetcher: async () => item,
        nowSec: 2_000_000_000,
        receiptRecipient: "0x0000000000000000000000000000000000000000",
      });
      expect(result.offers).toEqual([]);
      expect(result.sourceErrors).toHaveLength(1);
    }
  });

  it("rejects DNS rebinding between validation and the pinned fetch", async () => {
    let calls = 0;
    const result = await discoverCommerceOffersV1({
      sources: [source],
      dnsResolver: async () => (++calls === 1 ? [publicIp] : ["127.0.0.1"]),
      fetcher: async () => response(bazaar),
      nowSec: 2_000_000_000,
      receiptRecipient: "0x0000000000000000000000000000000000000000",
      confirmDnsBeforeParse: true,
    });
    expect(result.offers).toEqual([]);
    expect(result.sourceErrors[0]?.code).toBe("DISCOVERY_NETWORK_BLOCKED");
  });
});
