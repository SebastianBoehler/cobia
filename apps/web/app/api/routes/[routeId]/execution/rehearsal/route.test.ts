import { commitment } from "@cobia/domain";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRepositoryFixtureV2,
  repositoryTestAccount,
} from "../../../../../../lib/db/repository-test-fixtures";
import {
  buildExecutionRehearsalProof,
  executionRehearsalCommitment,
} from "../../../../../../lib/execution-v2/rehearsal-proof";

const nowSec = 1_786_391_000;
const other = privateKeyToAccount(keccak256(toHex("cobia-rehearsal-other")));
const state = vi.hoisted(() => ({
  purchase: undefined as Record<string, unknown> | undefined,
  publicRequest: undefined as Record<string, unknown> | undefined,
  attemptState: "running" as "running" | "passed" | "failed",
  trace: undefined as Record<string, unknown> | undefined,
  purchaseCalls: 0,
  beginCalls: 0,
  runnerCalls: 0,
  completed: undefined as Record<string, unknown> | undefined,
  failure: undefined as Error | undefined,
}));

vi.mock("@/lib/runtime/market", () => ({
  getPurchaseRepository: () => ({
    getPurchasedRoute: async () => {
      state.purchaseCalls += 1;
      return state.purchase;
    },
  }),
  getRequestRepository: () => ({
    getPublicRequest: async () => state.publicRequest,
  }),
  getRehearsalRepository: () => ({
    begin: async () => {
      state.beginCalls += 1;
      return {
        id: "34aa3307-a77b-47c5-a140-ae3d07503dca",
        state: state.attemptState,
        trace: state.trace,
        failureCode: null,
      };
    },
    complete: async (_id: string, input: Record<string, unknown>) => {
      state.completed = input;
      return { id: "34aa3307-a77b-47c5-a140-ae3d07503dca", state: "passed" };
    },
    fail: async () => ({ state: "failed" }),
  }),
}));

vi.mock("@/lib/execution-v2/anvil-rehearsal", () => ({
  runPurchasedRouteRehearsal: async () => {
    state.runnerCalls += 1;
    if (state.failure) throw state.failure;
    return {
      version: 1,
      mode: "xlayer-mainnet-fork",
      engineVersion: "execution-v2@1",
      registryHash: `0x${"11".repeat(32)}`,
      snapshot: { blockHash: `0x${"22".repeat(32)}` },
      result: { status: "success", transactions: [] },
    };
  },
}));

vi.mock("@/lib/payments/config", () => ({
  readPaymentTermsConfig: () => ({ PAYMENT_REALM: "localhost:3000" }),
}));
vi.mock("@/lib/db/purchased-route-artifact", async () =>
  import("../../../../../../lib/db/purchased-route-artifact"));
vi.mock("@/lib/execution-v2/rehearsal-proof", async () =>
  import("../../../../../../lib/execution-v2/rehearsal-proof"));

import { POST } from "./route";

type Fixture = Awaited<ReturnType<typeof createRepositoryFixtureV2>>;
let fixture: Fixture;

function context(routeId = fixture.quote.quoteId) {
  return { params: Promise.resolve({ routeId }) };
}

function proof(realm = "localhost:3000") {
  return buildExecutionRehearsalProof({
    realm,
    routeId: fixture.quote.quoteId,
    bundleHash: commitment(fixture.bundle),
    buyer: fixture.policy.owner,
    executionChainId: 196,
    nonce: `0x${"44".repeat(32)}`,
    expiresAt: nowSec + 240,
  });
}

async function request(input = proof(), signer = repositoryTestAccount) {
  const signature = await signer.signMessage({
    message: { raw: executionRehearsalCommitment(input) },
  });
  return POST(new Request(
    `http://localhost:3000/api/routes/${fixture.quote.quoteId}/execution/rehearsal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: input, signature }),
    },
  ), context());
}

describe("purchased-route fork rehearsal endpoint", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    fixture = await createRepositoryFixtureV2();
    state.purchase = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: fixture.policy.owner.toLowerCase(),
      executionChainId: 196,
      paymentChainId: 1952,
      paymentId: crypto.randomUUID(),
      receiptHash: `0x${"77".repeat(32)}`,
      bundle: fixture.bundle,
      purchasedAt: new Date("2026-08-11T08:00:00.000Z"),
    };
    state.publicRequest = { policy: fixture.policy, snapshot: fixture.snapshot };
    state.attemptState = "running";
    state.trace = undefined;
    state.purchaseCalls = 0;
    state.beginCalls = 0;
    state.runnerCalls = 0;
    state.completed = undefined;
    state.failure = undefined;
  });

  it("runs and durably binds the exact purchased route trace", async () => {
    const response = await request();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({ state: "passed", trace: { mode: "xlayer-mainnet-fork" } });
    expect(state.runnerCalls).toBe(1);
    expect(state.completed).toMatchObject({ engineVersion: "execution-v2@1" });
  });

  it("rejects a wrong signer before reading or running the purchase", async () => {
    const response = await request(proof(), other);
    expect(response.status).toBe(403);
    expect(state.purchaseCalls).toBe(0);
    expect(state.runnerCalls).toBe(0);
  });

  it("rejects a proof for a different configured realm", async () => {
    const response = await request(proof("attacker.example"));
    expect(response.status).toBe(403);
    expect(state.beginCalls).toBe(0);
  });

  it("returns an already-passed exact retry without another container", async () => {
    state.attemptState = "passed";
    state.trace = { mode: "xlayer-mainnet-fork", result: { status: "success" } };
    const response = await request();
    expect(await response.json()).toMatchObject({ state: "passed", trace: state.trace });
    expect(state.runnerCalls).toBe(0);
  });

  it("stores and returns a safe failure without reflecting internals", async () => {
    state.failure = new Error("rpc secret https://user:pass@example.invalid");
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body).toEqual({
      code: "PROTOCOL_REJECTED",
      message: "The purchased route did not pass fork rehearsal.",
    });
    expect(JSON.stringify(body)).not.toContain("user:pass");
  });
});
