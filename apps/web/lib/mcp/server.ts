import { McpServer } from "@modelcontextprotocol/server";
import {
  commitment,
  StablecoinPolicySchema,
  type StablecoinPolicy,
} from "@cobia/domain";
import { z } from "zod";
import { USDG_ADDRESS } from "../chain/xlayer";

interface CobiaMcpDependencies {
  discoverMarkets(): Promise<unknown[]>;
  getPublicRequest(requestId: string): Promise<unknown | undefined>;
  submitIntent(
    policy: StablecoinPolicy,
    ownerSignature: `0x${string}`,
  ): Promise<Record<string, unknown>>;
  randomUUID?: () => string;
  nowSec?: () => number;
}

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function createCobiaMcpServer(dependencies: CobiaMcpDependencies): McpServer {
  const server = new McpServer(
    { name: "cobia-intents", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "discover-yield-markets",
    {
      title: "Discover verified yield markets",
      description: "Returns live X Layer markets Cobia can research and constrain.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => toolResult({ markets: await dependencies.discoverMarkets() }),
  );

  server.registerTool(
    "prepare-yield-intent",
    {
      title: "Prepare a yield intent",
      description: "Builds an unsigned same-chain USDG policy. Wallet signature and submission remain external.",
      inputSchema: z.object({
        owner: z.string(),
        principalAtomic: z.string().regex(/^[1-9][0-9]*$/),
        maxProtocolExposureBps: z.number().int().min(1).max(10_000),
        minTvlUsdE6: z.string().regex(/^(0|[1-9][0-9]*)$/),
        minNetApyBps: z.number().int().min(0),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => {
      const nowSec = (dependencies.nowSec ?? (() => Math.floor(Date.now() / 1_000)))();
      const policy = StablecoinPolicySchema.parse({
        version: 1,
        requestId: (dependencies.randomUUID ?? crypto.randomUUID)(),
        owner: input.owner,
        executionChainId: 196,
        asset: USDG_ADDRESS,
        principalAtomic: input.principalAtomic,
        maxProtocolExposureBps: input.maxProtocolExposureBps,
        minTvlUsdE6: input.minTvlUsdE6,
        minNetApyBps: input.minNetApyBps,
        maxSnapshotAgeSec: 300,
        deadline: nowSec + 1_800,
        noBridges: true,
      });
      return toolResult({
        policy,
        policyHash: commitment(policy),
        requiresWalletSignature: true,
        next: "Sign outside the hosted agent, then submit through the Cobia app.",
      });
    },
  );

  server.registerTool(
    "submit-yield-intent",
    {
      title: "Submit a signed yield intent",
      description: "Verifies a wallet-signed policy and opens its solver competition. The server never receives a private key.",
      inputSchema: z.object({
        policy: StablecoinPolicySchema,
        ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ policy, ownerSignature }) => toolResult(
      await dependencies.submitIntent(policy, ownerSignature as `0x${string}`),
    ),
  );

  server.registerTool(
    "track-yield-intent",
    {
      title: "Track a yield intent",
      description: "Returns lifecycle state and sanitized quotes; private routes remain hidden until payment.",
      inputSchema: z.object({ requestId: z.string().uuid() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ requestId }) => {
      const request = await dependencies.getPublicRequest(requestId);
      if (!request) throw new Error("Yield intent not found");
      return toolResult({ request });
    },
  );

  return server;
}
