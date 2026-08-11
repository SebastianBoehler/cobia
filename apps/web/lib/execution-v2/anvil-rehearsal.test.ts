import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import type { PurchasedRouteArtifact } from "../db/purchased-route-artifact";
import { createRepositoryFixtureV2 } from "../db/repository-test-fixtures";
import {
  runPurchasedRouteRehearsal,
  type ForkExecutionOutput,
  type RehearsalRuntime,
} from "./anvil-rehearsal";

async function artifact(): Promise<PurchasedRouteArtifact> {
  const fixture = await createRepositoryFixtureV2();
  return {
    id: fixture.quote.quoteId,
    requestId: fixture.policy.requestId,
    quoteId: fixture.quote.quoteId,
    buyer: fixture.policy.owner,
    executionChainId: 196,
    paymentChainId: 1952,
    receiptHash: `0x${"77".repeat(32)}`,
    purchasedAt: new Date("2026-08-11T08:00:00.000Z"),
    policy: fixture.policy,
    snapshot: fixture.snapshot,
    bundle: fixture.bundle,
  };
}

function runtime() {
  const stop = vi.fn(async () => undefined);
  const start = vi.fn(async () => ({ rpcUrl: "http://fork.invalid", stop }));
  return { value: { start } satisfies RehearsalRuntime, start, stop };
}

function successfulExecution(route: PurchasedRouteArtifact): ForkExecutionOutput {
  return {
    snapshotBlockHash: route.snapshot.version === 2
      ? route.snapshot.blockHash
      : `0x${"00".repeat(32)}` as const,
    fundedPrincipalAtomic: route.policy.principalAtomic,
    result: {
      status: "no-action" as const,
      chainId: 196 as const,
      owner: route.policy.owner,
      transactions: [],
    },
  };
}

describe("purchased-route Anvil rehearsal", () => {
  it("starts the exact snapshot block and returns a JSON-safe trace", async () => {
    const route = await artifact();
    const fork = runtime();
    const executeOnFork = vi.fn(async () => successfulExecution(route));

    const trace = await runPurchasedRouteRehearsal(route, {
      runtime: fork.value,
      executeOnFork,
    });

    expect(fork.start).toHaveBeenCalledWith({
      blockNumber: BigInt(route.snapshot.blockNumber),
    });
    expect(executeOnFork).toHaveBeenCalledWith(expect.objectContaining({
      id: route.id,
      buyer: route.buyer,
      policy: expect.objectContaining({
        owner: route.policy.owner.toLowerCase(),
      }),
    }), "http://fork.invalid");
    expect(trace).toMatchObject({
      version: 1,
      mode: "xlayer-mainnet-fork",
      routeId: route.id,
      bundleHash: commitment(route.bundle),
      principalAtomic: route.policy.principalAtomic,
      result: { status: "no-action", transactions: [] },
    });
    expect(fork.stop).toHaveBeenCalledOnce();
  });

  it("rejects a fork whose snapshot hash differs and still stops it", async () => {
    const route = await artifact();
    const fork = runtime();

    await expect(runPurchasedRouteRehearsal(route, {
      runtime: fork.value,
      executeOnFork: async () => ({
        ...successfulExecution(route),
        snapshotBlockHash: `0x${"99".repeat(32)}`,
      }),
    })).rejects.toThrow("snapshot block hash");
    expect(fork.stop).toHaveBeenCalledOnce();
  });

  it("rejects funding that is not the exact purchased principal", async () => {
    const route = await artifact();
    const fork = runtime();

    await expect(runPurchasedRouteRehearsal(route, {
      runtime: fork.value,
      executeOnFork: async () => ({
        ...successfulExecution(route),
        fundedPrincipalAtomic: "1",
      }),
    })).rejects.toThrow("funded principal");
    expect(fork.stop).toHaveBeenCalledOnce();
  });

  it("rejects V1 artifacts before starting a container", async () => {
    const route = await artifact();
    const fork = runtime();
    const legacy = {
      ...route,
      policy: { ...route.policy, version: 1 },
    } as unknown as PurchasedRouteArtifact;

    await expect(runPurchasedRouteRehearsal(legacy, {
      runtime: fork.value,
      executeOnFork: async () => successfulExecution(route),
    })).rejects.toThrow("V2");
    expect(fork.start).not.toHaveBeenCalled();
  });

  it("times out and stops a hanging rehearsal", async () => {
    const route = await artifact();
    const fork = runtime();

    await expect(runPurchasedRouteRehearsal(route, {
      runtime: fork.value,
      timeoutMs: 5,
      executeOnFork: () => new Promise(() => undefined),
    })).rejects.toThrow("timed out");
    expect(fork.stop).toHaveBeenCalledOnce();
  });
});
