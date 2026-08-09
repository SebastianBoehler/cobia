import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCobiaMcpServer } from "./server";

const closeables: Array<{ close(): Promise<void> }> = [];
afterEach(async () => Promise.all(closeables.splice(0).map((item) => item.close())));

async function connect() {
  const submitted: string[] = [];
  const server = createCobiaMcpServer({
    discoverMarkets: async () => [{ chainId: 196, asset: "USDG", protocol: "Aave V3", live: true }],
    getPublicRequest: async (requestId) => requestId === "550e8400-e29b-41d4-a716-446655440000"
      ? { requestId, state: "quotes_ready", quotes: [] }
      : undefined,
    submitIntent: async (policy, ownerSignature) => {
      submitted.push(ownerSignature);
      return { requestId: policy.requestId, quoteCount: 2, failureCount: 0 };
    },
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    nowSec: () => 1_900_000_000,
  });
  const client = new Client({ name: "cobia-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeables.push(client, server);
  return { client, submitted };
}

describe("Cobia MCP server", () => {
  it("exposes a small read-first intent tool surface", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual([
      "discover-yield-markets",
      "prepare-yield-intent",
      "submit-yield-intent",
      "track-yield-intent",
    ]);
  });

  it("prepares an unsigned constrained policy without moving funds", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "prepare-yield-intent",
      arguments: {
        owner: "0x1111111111111111111111111111111111111111",
        principalAtomic: "25000000000",
        maxProtocolExposureBps: 4_000,
        minTvlUsdE6: "250000000000",
        minNetApyBps: 200,
      },
    });
    expect(result.structuredContent).toMatchObject({
      requiresWalletSignature: true,
      policy: { requestId: "550e8400-e29b-41d4-a716-446655440000", executionChainId: 196 },
    });
  });

  it("submits only an externally signed policy", async () => {
    const { client, submitted } = await connect();
    const ownerSignature = `0x${"ab".repeat(65)}`;
    const result = await client.callTool({
      name: "submit-yield-intent",
      arguments: {
        policy: {
          version: 1,
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          owner: "0x1111111111111111111111111111111111111111",
          executionChainId: 196,
          asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
          principalAtomic: "25000000000",
          maxProtocolExposureBps: 4_000,
          minTvlUsdE6: "250000000000",
          minNetApyBps: 200,
          maxSnapshotAgeSec: 300,
          deadline: 2_000_000_000,
          noBridges: true,
        },
        ownerSignature,
      },
    });
    expect(result.structuredContent).toMatchObject({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      quoteCount: 2,
    });
    expect(submitted).toEqual([ownerSignature]);
  });
});
