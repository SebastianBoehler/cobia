import { McpServer } from "@modelcontextprotocol/server";
import {
  commitment,
  parseStablecoinPolicyV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import { z } from "zod";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import {
  buildRoutePolicyV2,
  ProductRoutePolicyV2Schema,
} from "../intents/route-policy-v2";

interface CobiaMcpDependencies {
  discoverMarkets(): Promise<unknown[]>;
  getPublicRequest(requestId: string): Promise<unknown | undefined>;
  submitIntent(
    policy: StablecoinPolicyV2,
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
  const readNowSec = dependencies.nowSec ?? (() => Math.floor(Date.now() / 1_000));
  const server = new McpServer(
    { name: "cobia-intents", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "discover-yield-markets",
    {
      title: "Discover live yield inputs",
      description: "Returns informational OKX Aave estimates. The block-pinned V2 route snapshot is captured separately when a signed intent is submitted.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => toolResult({ markets: await dependencies.discoverMarkets() }),
  );

  server.registerTool(
    "prepare-yield-intent",
    {
      title: "Prepare a yield intent",
      description: "Builds an unsigned same-chain V2 route policy. Wallet signature and submission remain external.",
      inputSchema: z.object({
        owner: z.string(),
        asset: z.enum(["USDG", "USDt0"]),
        principalAtomic: z.string().regex(/^[1-9][0-9]*$/),
        protocolExposureBps: z.number().int().min(1).max(10_000),
        minTvlUsdE6: z.string().regex(/^(0|[1-9][0-9]*)$/),
        minPreGasApyBps: z.number().int().min(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => {
      const nowSec = readNowSec();
      const asset = SUPPORTED_ASSETS.find(({ displaySymbol }) =>
        displaySymbol === input.asset)!;
      const policy = buildRoutePolicyV2({
        requestId: (dependencies.randomUUID ?? crypto.randomUUID)(),
        owner: input.owner as `0x${string}`,
        asset: asset.address,
        principalAtomic: input.principalAtomic,
        protocolExposureBps: input.protocolExposureBps,
        minTvlUsdE6: input.minTvlUsdE6,
        minPreGasApyBps: input.minPreGasApyBps,
        nowSec,
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
      description: "Checks a wallet-signed V2 policy and evaluates registered Aave V3 supply and Uniswap V3 swap opportunities at one pinned X Layer block. A result may contain no authorized quote. Principal remains unmoved, and the server never receives a private key.",
      inputSchema: z.object({
        policy: ProductRoutePolicyV2Schema,
        ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ policy: policyInput, ownerSignature }) => {
      const policy = ProductRoutePolicyV2Schema.parse(
        parseStablecoinPolicyV2(policyInput, readNowSec()),
      );
      return toolResult(await dependencies.submitIntent(policy, ownerSignature as `0x${string}`));
    },
  );

  server.registerTool(
    "track-yield-intent",
    {
      title: "Track a yield intent",
      description: "Returns lifecycle state and sanitized solver quotes; signed bundles remain hidden until payment.",
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
