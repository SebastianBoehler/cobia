import {
  StablecoinPolicyV2Schema,
  commitment,
  type RouteBundleV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  buildSelectedRouteBundleV2,
  listRouteCandidateSummariesV2,
  signRouteBundleV2,
} from "@cobia/solvers";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { xLayer } from "../chain/xlayer";
import { USDG_ADDRESS } from "../chain/xlayer";
import type { PurchasedRouteArtifact } from "../db/purchased-route-artifact";
import { buildRoutePolicyV2 } from "../intents/route-policy-v2";
import { captureRouteSnapshotV2 } from "../orchestrator/capture-route-snapshot-v2";
import { routeSnapshotDependencies } from "../orchestrator/route-snapshot-client";
import { runPurchasedRouteRehearsal } from "./anvil-rehearsal";

const XLAYER_RPC = "https://rpc.xlayer.tech";
const PRINCIPAL = "10000000";
const solver = privateKeyToAccount(keccak256(toHex("cobia-purchased-route-fork-solver")));
const buyer = privateKeyToAccount(keccak256(toHex("cobia-purchased-route-fork-buyer")));

async function capturedRoute(input: {
  requestId: string;
  actionKinds: readonly string[];
}): Promise<PurchasedRouteArtifact> {
  const client = createPublicClient({
    cacheTime: 0,
    chain: xLayer,
    transport: http(XLAYER_RPC),
  });
  const block = await client.getBlock({ blockTag: "latest" });
  const policy = StablecoinPolicyV2Schema.parse(buildRoutePolicyV2({
    requestId: input.requestId,
    owner: buyer.address,
    asset: USDG_ADDRESS,
    principalAtomic: PRINCIPAL,
    protocolExposureBps: 10_000,
    minTvlUsdE6: "1000000",
    minPreGasApyBps: 1,
    nowSec: Number(block.timestamp),
  }));
  const snapshot = await captureRouteSnapshotV2(
    policy,
    routeSnapshotDependencies(client),
  );
  const nowSec = Math.floor(Date.parse(snapshot.capturedAt) / 1_000);
  const candidates = listRouteCandidateSummariesV2({ policy, snapshot, nowSec });
  const candidate = candidates.find(({ actions }) =>
    actions.length === input.actionKinds.length &&
    actions.every((action, index) => action === input.actionKinds[index]));
  if (!candidate) {
    throw new Error(`Pinned X Layer snapshot has no ${input.actionKinds.join(" -> ")} route`);
  }
  const unsigned = buildSelectedRouteBundleV2(
    { policy, snapshot, nowSec },
    {
      solverId: "purchased-route-fork-solver",
      solverAddress: solver.address,
      expectedAdapterRegistryHash: registryHash,
    },
    candidate.id,
  );
  const bundle = await signRouteBundleV2(unsigned, solver);
  return artifact(policy, snapshot, bundle);
}

function artifact(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  bundle: RouteBundleV2,
): PurchasedRouteArtifact {
  const routeId = commitment(bundle);
  return {
    id: routeId,
    requestId: policy.requestId,
    quoteId: routeId,
    buyer: policy.owner,
    executionChainId: 196,
    paymentChainId: 1952,
    receiptHash: `0x${"77".repeat(32)}`,
    purchasedAt: new Date(),
    policy,
    snapshot,
    bundle,
  };
}

describe("purchased V2 route execution on a pinned X Layer fork", () => {
  it("rehearses a direct Aave supply with exact receipt attribution", async () => {
    const route = await capturedRoute({
      requestId: "550e8400-e29b-41d4-a716-446655440091",
      actionKinds: ["aave-v3-supply"],
    });
    const trace = await runPurchasedRouteRehearsal(route);

    expect(trace.result.status).toBe("success");
    expect(trace.result.transactions.map(({ label }) => label)).toEqual([
      "approve-aave-exact",
      "aave-v3-supply",
    ]);
    expect(trace.principalAtomic).toBe(PRINCIPAL);
  });

  it("rehearses swap then supply with all four attributed transactions", async () => {
    const route = await capturedRoute({
      requestId: "550e8400-e29b-41d4-a716-446655440092",
      actionKinds: ["uniswap-v3-exact-input", "aave-v3-supply"],
    });
    const trace = await runPurchasedRouteRehearsal(route);

    expect(trace.result.status).toBe("success");
    expect(trace.result.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact",
      "uniswap-v3-exact-input",
      "approve-aave-exact",
      "aave-v3-supply",
    ]);
    expect(trace.snapshot.blockHash).toBe(route.snapshot.blockHash);
  });

  it("rehearses one-sided balancing and an owner-held full-range LP mint", async () => {
    const route = await capturedRoute({
      requestId: "550e8400-e29b-41d4-a716-446655440093",
      actionKinds: ["uniswap-v3-balance-swap", "uniswap-v3-full-range-mint"],
    });
    const trace = await runPurchasedRouteRehearsal(route);

    expect(trace.result.status).toBe("success");
    expect(trace.result.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact",
      "uniswap-v3-exact-input",
      "approve-position-manager-exact",
      "approve-position-manager-exact",
      "uniswap-v3-full-range-mint",
    ]);
    expect(trace.result.transactions.at(-1)?.stateCheck).toMatchObject({
      kind: "uniswap-lp-mint",
      token0: PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
      token1: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
    });
  });
});
