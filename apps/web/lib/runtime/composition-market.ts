import type { CapabilityCompositionPolicyV1 } from "@cobia/domain";
import { createPublicClient, http, type Address } from "viem";
import { readMarketConfig, readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { captureCapabilityCompositionSnapshotV1 } from "../open-exchange/capture-composition-snapshot";
import { routeSnapshotDependencies } from "../orchestrator/route-snapshot-client";
import { xLayer } from "../chain/xlayer";
import { OwnerBalanceRequiredError } from "./market-errors";

interface Repositories {
  intents: { create(input: {
    policy: CapabilityCompositionPolicyV1;
    ownerSignature: `0x${string}`;
  }): Promise<unknown> };
  snapshots: { create(snapshot: unknown): Promise<unknown> };
}

export async function publishCapabilityComposition(
  input: {
    policy: CapabilityCompositionPolicyV1;
    ownerSignature: `0x${string}`;
  },
  repositories: Repositories,
) {
  const config = readMarketConfig();
  const client = createPublicClient({
    chain: xLayer,
    transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }),
    cacheTime: 0,
  });
  if (await client.getBalance({ address: input.policy.owner as Address }) === 0n) {
    throw new OwnerBalanceRequiredError();
  }
  const okx = createOkxClient({ credentials: readOkxCredentials() });
  const snapshot = await captureCapabilityCompositionSnapshotV1(input.policy, {
    route: routeSnapshotDependencies(client),
    getGasPrice: () => client.getGasPrice(),
    getNativeToken: async () => {
      const token = await okx.searchXLayerToken("OKB");
      return token?.priceUsd ? {
        chainId: token.chainId, token: token.token, symbol: token.symbol,
        decimals: token.decimals, priceUsd: token.priceUsd,
      } : undefined;
    },
  });
  const intent = await repositories.intents.create(input);
  await repositories.snapshots.create(snapshot);
  return { intent, snapshot };
}
