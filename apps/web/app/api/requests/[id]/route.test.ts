import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositoryFixture, createRepositoryFixtureV2, repositoryTestNowSec } from "../../../../lib/db/repository-test-fixtures";
import { buildContextPaymentTerms, type AuthoritativePaymentContext } from "../../../../lib/payments/payment-context";
import { PaymentTermsSchema } from "../../../../lib/payments/terms";
import { LEGACY_PAYMENT_ASSET } from "../../../../lib/payments/support";

const state = vi.hoisted(() => ({
  publicRequest: undefined as unknown,
  paymentContext: undefined as unknown,
  contextCalls: 0,
  publicNowSec: undefined as number | undefined,
  paymentAttempt: undefined as undefined | {
    state: "pending" | "settled" | "finalized";
    credentialHash: string | null;
    paymentTerms?: unknown;
  },
  paymentCalls: 0,
  configCalls: 0,
  configRejected: false,
}));

vi.mock("@/lib/runtime/market", () => ({
  getRequestRepository: () => ({
    getPublicRequest: async (_requestId: string, nowSec: number) => {
      state.publicNowSec = nowSec;
      return state.publicRequest;
    },
    getPaymentContext: async () => {
      state.contextCalls += 1;
      return state.paymentContext;
    },
  }),
  getPaymentRepository: () => ({
    getPaymentByRequest: async () => {
      state.paymentCalls += 1;
      return state.paymentAttempt;
    },
  }),
}));

vi.mock("@/lib/payments/config", () => ({
  readPaymentTermsConfig: () => {
    state.configCalls += 1;
    if (state.configRejected) throw new Error("rotated payment config");
    return {
    COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
    PAYMENT_REALM: "pay.cobia.example",
    };
  },
}));

vi.mock("@/lib/payments/payment-context", async () =>
  import("../../../../lib/payments/payment-context"));
vi.mock("@/lib/payments/terms", async () => import("../../../../lib/payments/terms"));
vi.mock("@/lib/markets/active-quotes", async () =>
  import("../../../../lib/markets/active-quotes"));

import { GET } from "./route";

describe("public request payment terms", () => {
  beforeEach(() => {
    state.contextCalls = 0;
    state.paymentContext = undefined;
    state.publicNowSec = undefined;
    state.paymentAttempt = undefined;
    state.paymentCalls = 0;
    state.configCalls = 0;
    state.configRejected = false;
  });

  afterEach(() => vi.restoreAllMocks());

  it("includes stable non-secret terms for the selected quote without leaking its bundle", async () => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "selected",
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: null,
      quotes: [fixture.quote],
    };
    state.paymentContext = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paymentTerms).toMatchObject({
      realm: "pay.cobia.example",
      externalId: fixture.quote.quoteId,
      issuedAt: repositoryTestNowSec,
      expiresAt: fixture.quote.validUntil,
    });
    expect(body.freshness).toEqual({
      observedAtSec: repositoryTestNowSec,
      nextExpirySec: fixture.quote.validUntil,
    });
    expect(state.publicNowSec).toBe(repositoryTestNowSec);
    expect(JSON.stringify(body)).not.toContain(fixture.bundle.action.kind);
    expect(state.contextCalls).toBe(1);
  });

  it("does not build payment terms before quote selection", async () => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "quotes_ready",
      policy: fixture.policy,
      selectedQuoteId: null,
      purchasedRouteId: null,
      quotes: [],
    };
    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: "request-1" }),
    });
    const body = await response.json();
    expect(body).not.toHaveProperty("paymentTerms");
    expect(body.freshness).toEqual({
      observedAtSec: repositoryTestNowSec,
      nextExpirySec: null,
    });
    expect(state.contextCalls).toBe(0);
  });

  it("returns authoritative payment terms for a selected V2 route", async () => {
    const fixture = await createRepositoryFixtureV2();
    vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "selected",
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: null,
      quotes: [fixture.quote],
    };
    state.paymentContext = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paymentTerms).toMatchObject({
      externalId: fixture.quote.quoteId,
      expiresAt: fixture.quote.validUntil,
    });
    expect(body.paymentRecovery).toBe("none");
    expect(state.contextCalls).toBe(1);
    expect(state.paymentCalls).toBe(0);
    expect(state.configCalls).toBe(1);
  });

  it("keeps executed history linked without rebuilding payment terms", async () => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(fixture.quote.validUntil * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "executed",
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: fixture.quote.quoteId,
      quotes: [fixture.quote],
    };

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.purchasedRouteId).toBe(fixture.quote.quoteId);
    expect(body).not.toHaveProperty("paymentTerms");
    expect(state.contextCalls).toBe(0);
  });

  it.each([
    [null, "resume"],
    [`0x${"ab".repeat(32)}`, "reconcile"],
  ])("distinguishes safe pending resume from credential reconciliation", async (
    credentialHash,
    expectedRecovery,
  ) => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "payment_pending",
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: null,
      quotes: [fixture.quote],
    };
    state.paymentContext = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };
    state.paymentAttempt = {
      state: "pending",
      credentialHash,
      paymentTerms: buildContextPaymentTerms(state.paymentContext as AuthoritativePaymentContext, {
        COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
        PAYMENT_REALM: "pay.cobia.example",
      }),
    };

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).paymentRecovery).toBe(expectedRecovery);
    expect(state.paymentCalls).toBe(1);
  });

  it("keeps a legacy testnet payment attempt in read-only reconciliation", async () => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(repositoryTestNowSec * 1_000);
    state.publicRequest = { requestId: fixture.policy.requestId, state: "payment_pending",
      policy: fixture.policy, snapshot: fixture.snapshot, selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: null, quotes: [fixture.quote] };
    const currentTerms = buildContextPaymentTerms({
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    }, {
      COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
      PAYMENT_REALM: "pay.cobia.example",
    });
    state.paymentAttempt = { state: "pending", credentialHash: null,
      paymentTerms: PaymentTermsSchema.parse({
        ...currentTerms,
        version: 1,
        paymentChainId: 1952,
        currency: LEGACY_PAYMENT_ASSET,
      }),
    };

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paymentRecovery).toBe("reconcile");
    expect(body).not.toHaveProperty("paymentTerms");
  });

  it("marks a settled paid request as recoverable without exposing payment data", async () => {
    const fixture = await createRepositoryFixture();
    vi.spyOn(Date, "now").mockReturnValue(fixture.quote.validUntil * 1_000);
    state.publicRequest = {
      requestId: fixture.policy.requestId,
      state: "paid",
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      selectedQuoteId: fixture.quote.quoteId,
      purchasedRouteId: null,
      quotes: [fixture.quote],
    };
    const paymentContext: AuthoritativePaymentContext = {
      ...fixture,
      quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
    };
    state.paymentContext = paymentContext;
    const storedTerms = buildContextPaymentTerms(paymentContext, {
      COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
      PAYMENT_REALM: "pay.cobia.example",
    });
    state.paymentAttempt = {
      state: "settled", credentialHash: "credential-secret-marker", paymentTerms: storedTerms,
    };
    state.configRejected = true;

    const response = await GET(new Request("https://cobia.example"), {
      params: Promise.resolve({ id: fixture.policy.requestId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paymentRecovery).toBe("recover");
    expect(body.paymentTerms).toEqual(storedTerms);
    expect(state.configCalls).toBe(0);
    expect(JSON.stringify(body)).not.toContain(state.paymentAttempt.credentialHash);
  });
});
