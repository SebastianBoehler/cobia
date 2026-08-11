import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { createCobiaMcpServer } from "./server";

const closeables: Array<{ close(): Promise<void> }> = [];
const nowSec = 1_900_000_000;
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
    nowSec: () => nowSec,
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
    const tools = (await client.listTools()).tools;
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual([
      "discover-yield-markets",
      "prepare-yield-intent",
      "submit-yield-intent",
      "track-yield-intent",
    ]);
    expect(tools.find((tool) => tool.name === "discover-yield-markets")?.description)
      .toMatch(/informational OKX Aave/i);
  });

  it("prepares an unsigned constrained policy without moving funds", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "prepare-yield-intent",
      arguments: {
        owner: "0x1111111111111111111111111111111111111111",
        asset: "USDt0",
        principalAtomic: "25000000000",
        protocolExposureBps: 4_000,
        minTvlUsdE6: "250000000000",
        minPreGasApyBps: 200,
      },
    });
    expect(result.structuredContent).toMatchObject({
      requiresWalletSignature: true,
      policy: {
        version: 2,
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        executionChainId: 196,
        deadline: nowSec + 1_800,
        allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
      },
    });
  });

  it("rejects a zero APY floor before creating a monetizable intent", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "prepare-yield-intent",
      arguments: {
        owner: "0x1111111111111111111111111111111111111111",
        asset: "USDG",
        principalAtomic: "25000000000",
        protocolExposureBps: 4_000,
        minTvlUsdE6: "250000000000",
        minPreGasApyBps: 0,
      },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects the same stale-at-now deadline as the HTTP ingress", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "submit-yield-intent",
      arguments: {
        policy: {
          version: 2,
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          owner: "0x1111111111111111111111111111111111111111",
          executionChainId: 196,
          asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
          principalAtomic: "25000000000",
          protocolExposureBps: 4_000,
          minTvlUsdE6: "250000000000",
          minPreGasApyBps: 200,
          maxSnapshotAgeSec: 300,
          deadline: nowSec,
          noBridges: true,
          allowedOutputAssets: [
            "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
            "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          ],
          allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
          maxSlippageBps: 50,
          horizonDays: 30,
        },
        ownerSignature: `0x${"ab".repeat(65)}`,
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      type: "text",
      text: "Policy deadline must be in the future",
    }]);
  });

  it("rejects a zero APY floor on signed-policy submission", async () => {
    const { client, submitted } = await connect();
    const result = await client.callTool({
      name: "submit-yield-intent",
      arguments: {
        policy: {
          version: 2,
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          owner: "0x1111111111111111111111111111111111111111",
          executionChainId: 196,
          asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
          principalAtomic: "25000000000",
          protocolExposureBps: 4_000,
          minTvlUsdE6: "250000000000",
          minPreGasApyBps: 0,
          maxSnapshotAgeSec: 300,
          deadline: nowSec + 1,
          noBridges: true,
          allowedOutputAssets: [
            "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
            "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          ],
          allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
          maxSlippageBps: 50,
          horizonDays: 30,
        },
        ownerSignature: `0x${"ab".repeat(65)}`,
      },
    });
    expect(result.isError).toBe(true);
    expect(submitted).toEqual([]);
  });

  it("submits only an externally signed policy", async () => {
    const { client, submitted } = await connect();
    const ownerSignature = `0x${"ab".repeat(65)}`;
    const result = await client.callTool({
      name: "submit-yield-intent",
      arguments: {
        policy: {
          version: 2,
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          owner: "0x1111111111111111111111111111111111111111",
          executionChainId: 196,
          asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
          principalAtomic: "25000000000",
          protocolExposureBps: 4_000,
          minTvlUsdE6: "250000000000",
          minPreGasApyBps: 200,
          maxSnapshotAgeSec: 300,
          deadline: nowSec + 1,
          noBridges: true,
          allowedOutputAssets: [
            "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
            "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          ],
          allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
          maxSlippageBps: 50,
          horizonDays: 30,
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

  it("rejects a malformed deadline before MCP request creation", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "submit-yield-intent",
      arguments: {
        policy: {
          version: 2,
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          owner: "0x1111111111111111111111111111111111111111",
          executionChainId: 196,
          asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
          principalAtomic: "25000000000",
          protocolExposureBps: 4_000,
          minTvlUsdE6: "250000000000",
          minPreGasApyBps: 200,
          maxSnapshotAgeSec: 300,
          deadline: `${nowSec + 1}`,
          noBridges: true,
          allowedOutputAssets: [
            "0x4ae46a509f6b1d9056937BA4500cb143933D2dc8",
            "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          ],
          allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
          maxSlippageBps: 50,
          horizonDays: 30,
        },
        ownerSignature: `0x${"ab".repeat(65)}`,
      },
    });
    expect(result.isError).toBe(true);
  });
});
