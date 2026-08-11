import { StablecoinPolicyV2Schema, commitment } from "@cobia/domain";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRepositoryFixture,
  createRepositoryFixtureV2,
  repositoryTestAccount,
} from "../../../../lib/db/repository-test-fixtures";
import { routeAccessCommitment } from "../../../../lib/intents/signature";

const nowSec = 1_786_391_000;
const attacker = privateKeyToAccount(keccak256(toHex("cobia-route-access-attacker")));
const state = vi.hoisted(() => ({
  purchase: undefined as Record<string, unknown> | undefined,
  publicRequest: undefined as Record<string, unknown> | undefined,
  rehearsal: undefined as Record<string, unknown> | undefined,
  purchaseCalls: 0,
  requestCalls: 0,
  rehearsalCalls: 0,
}));

vi.mock("@/lib/runtime/market", () => ({
  getPurchaseRepository: () => ({
    getPurchasedRoute: async (routeId: string, buyer: string) => {
      state.purchaseCalls += 1;
      if (
        state.purchase?.id !== routeId ||
        typeof state.purchase.buyer !== "string" ||
        state.purchase.buyer.toLowerCase() !== buyer.toLowerCase()
      ) return undefined;
      return state.purchase;
    },
  }),
  getRequestRepository: () => ({
    getPublicRequest: async () => {
      state.requestCalls += 1;
      return state.publicRequest;
    },
  }),
  getRehearsalRepository: () => ({
    findPassed: async () => {
      state.rehearsalCalls += 1;
      return state.rehearsal;
    },
  }),
}));

vi.mock("@/lib/payments/config", () => ({
  readPaymentTermsConfig: () => ({ PAYMENT_REALM: "localhost:3000" }),
}));

vi.mock("@/lib/intents/signature", async () =>
  import("../../../../lib/intents/signature"));
vi.mock("@/lib/db/purchased-route-artifact", async () =>
  import("../../../../lib/db/purchased-route-artifact"));

import { GET } from "./route";

type Fixture = Awaited<ReturnType<typeof createRepositoryFixture>>;
let fixture: Fixture;

function context(routeId: string) {
  return { params: Promise.resolve({ routeId }) };
}

async function access(input: {
  routeId?: string;
  signedRouteId?: string;
  buyer?: `0x${string}`;
  signer?: typeof repositoryTestAccount;
  timestamp?: number;
  signature?: `0x${string}`;
} = {}) {
  const routeId = input.routeId ?? fixture.quote.quoteId;
  const buyer = input.buyer ?? repositoryTestAccount.address;
  const timestamp = input.timestamp ?? nowSec;
  const signature = input.signature ?? await (input.signer ?? repositoryTestAccount).signMessage({
    message: {
      raw: routeAccessCommitment(input.signedRouteId ?? routeId, buyer, timestamp),
    },
  });
  return GET(new Request(`https://cobia.example/api/routes/${routeId}`, {
    headers: {
      "x-cobia-buyer": buyer,
      "x-cobia-signature": signature,
      "x-cobia-timestamp": String(timestamp),
    },
  }), context(routeId));
}

async function expectPrivateFailure(response: Response, status: number) {
  const body = await response.json();
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(body).not.toHaveProperty("bundle");
  expect(JSON.stringify(body)).not.toContain(fixture.bundle.signature);
}

describe("purchased route access", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    fixture = await createRepositoryFixture();
    state.purchase = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: repositoryTestAccount.address.toLowerCase(),
      executionChainId: fixture.policy.executionChainId,
      paymentChainId: 1952,
      paymentId: crypto.randomUUID(),
      receiptHash: `0x${"ef".repeat(32)}`,
      bundle: fixture.bundle,
      purchasedAt: new Date((nowSec - 60) * 1_000),
      internalSecret: "must-not-leak",
    };
    state.publicRequest = { policy: fixture.policy, snapshot: fixture.snapshot };
    state.rehearsal = undefined;
    state.purchaseCalls = 0;
    state.requestCalls = 0;
    state.rehearsalCalls = 0;
  });

  afterEach(() => vi.useRealTimers());

  it("returns the committed private bundle only for the purchasing buyer's raw signature", async () => {
    const response = await access();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.bundle).toStrictEqual(fixture.bundle);
    expect(body.policy).toStrictEqual(fixture.policy);
    expect(body.snapshot).toStrictEqual(fixture.snapshot);
    expect(body).not.toHaveProperty("internalSecret");
  });

  it("returns an integrity-checked V2 policy, snapshot, and route bundle", async () => {
    const routeFixture = await createRepositoryFixtureV2();
    const policy = StablecoinPolicyV2Schema.parse(routeFixture.policy);
    state.purchase = {
      ...state.purchase,
      id: routeFixture.quote.quoteId,
      requestId: policy.requestId,
      quoteId: routeFixture.quote.quoteId,
      executionChainId: policy.executionChainId,
      bundle: routeFixture.bundle,
    };
    state.publicRequest = { policy, snapshot: routeFixture.snapshot };
    state.rehearsal = {
      id: "34aa3307-a77b-47c5-a140-ae3d07503dca",
      state: "passed",
      trace: { mode: "xlayer-mainnet-fork", result: { status: "success" } },
    };

    const response = await access({ routeId: routeFixture.quote.quoteId });
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      policy: { version: 2, requestId: policy.requestId },
      snapshot: { version: 2, requestId: policy.requestId },
      bundle: { version: 2, requestId: policy.requestId },
      rehearsalRealm: "localhost:3000",
      rehearsal: {
        id: "34aa3307-a77b-47c5-a140-ae3d07503dca",
        state: "passed",
        trace: { mode: "xlayer-mainnet-fork" },
      },
    });
    expect(body.snapshot).toStrictEqual(routeFixture.snapshot);
    expect(state.rehearsalCalls).toBe(1);
  });

  it("fails closed when the purchased snapshot no longer matches its commitment", async () => {
    state.publicRequest = {
      policy: fixture.policy,
      snapshot: { ...fixture.snapshot, blockNumber: "1001" },
    };

    await expectPrivateFailure(await access(), 503);
  });

  it("fails closed when a V2 purchase is paired with a V1 snapshot", async () => {
    const routeFixture = await createRepositoryFixtureV2();
    const policy = StablecoinPolicyV2Schema.parse(routeFixture.policy);
    state.purchase = {
      ...state.purchase,
      id: routeFixture.quote.quoteId,
      requestId: policy.requestId,
      quoteId: routeFixture.quote.quoteId,
      bundle: routeFixture.bundle,
    };
    state.publicRequest = {
      policy,
      snapshot: { ...fixture.snapshot, requestId: policy.requestId },
    };

    await expectPrivateFailure(await access({
      routeId: routeFixture.quote.quoteId,
    }), 503);
  });

  it("does not reveal an owner's route through a purchase stored for another buyer", async () => {
    state.purchase = { ...state.purchase, buyer: attacker.address.toLowerCase() };

    await expectPrivateFailure(await access({
      buyer: attacker.address,
      signer: attacker,
    }), 503);
  });

  it("rejects a signature made by a wallet other than the declared buyer", async () => {
    await expectPrivateFailure(await access({ signer: attacker }), 403);
    expect(state.purchaseCalls).toBe(0);
  });

  it("does not reveal a purchase to a different buyer with a valid self-signature", async () => {
    await expectPrivateFailure(await access({ buyer: attacker.address, signer: attacker }), 404);
    expect(state.requestCalls).toBe(0);
  });

  it("rejects stale proofs before querying the purchase", async () => {
    await expectPrivateFailure(await access({ timestamp: nowSec - 301 }), 401);
    expect(state.purchaseCalls).toBe(0);
  });

  it("rejects a route id changed after the buyer signed", async () => {
    const changedRoute = `0x${"aa".repeat(32)}`;
    await expectPrivateFailure(await access({
      routeId: changedRoute,
      signedRouteId: fixture.quote.quoteId,
    }), 403);
    expect(state.purchaseCalls).toBe(0);
  });

  it("rejects a tampered signature before querying the purchase", async () => {
    const valid = await repositoryTestAccount.signMessage({
      message: { raw: routeAccessCommitment(fixture.quote.quoteId, repositoryTestAccount.address, nowSec) },
    });
    const firstByte = valid.slice(2, 4) === "00" ? "01" : "00";
    const tampered = `0x${firstByte}${valid.slice(4)}` as `0x${string}`;
    await expectPrivateFailure(await access({ signature: tampered }), 403);
    expect(state.purchaseCalls).toBe(0);
  });

  it("runtime-rejects a malformed route parameter before crypto or storage", async () => {
    await expectPrivateFailure(await access({ routeId: "not-a-route-hash" }), 400);
    expect(state.purchaseCalls).toBe(0);
  });

  it("fails closed when the stored bundle no longer commits to the purchased route", async () => {
    state.purchase = {
      ...state.purchase,
      bundle: { ...fixture.bundle, expectedNetApyBps: fixture.bundle.expectedNetApyBps + 1 },
    };
    expect(commitment(state.purchase.bundle)).not.toBe(fixture.quote.quoteId);

    await expectPrivateFailure(await access(), 503);
  });

  it("fails closed when the request policy no longer matches the bundle commitment", async () => {
    state.publicRequest = {
      policy: { ...fixture.policy, principalAtomic: "1" },
    };

    await expectPrivateFailure(await access(), 503);
  });
});
