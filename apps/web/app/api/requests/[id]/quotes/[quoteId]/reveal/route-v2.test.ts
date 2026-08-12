import {
  RouteBundleV2Schema,
  StablecoinPolicyV2Schema,
  commitment,
} from "@cobia/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRepositoryFixtureV2,
  repositoryTestAccount,
  repositoryTestNowSec,
} from "../../../../../../../lib/db/repository-test-fixtures";
import {
  buildRevealProof,
  revealProofCommitment,
} from "../../../../../../../lib/payments/reveal-proof";
import { buildContextPaymentTerms } from "../../../../../../../lib/payments/payment-context";
import { hashPaymentTerms } from "../../../../../../../lib/payments/terms";

const state = vi.hoisted(() => ({
  context: undefined as unknown,
  attempt: undefined as unknown,
  finalized: undefined as unknown,
  finalizeCalls: 0,
}));

vi.mock("@/lib/runtime/market", () => ({
  getRequestRepository: () => ({
    getPaymentContext: async () => state.context,
  }),
  getPaymentRepository: () => ({
    getPaymentByRequest: async () => state.attempt,
    finalizePayment: async () => {
      state.finalizeCalls += 1;
      return state.finalized;
    },
  }),
}));

vi.mock("@/lib/db/purchased-route-artifact", async () =>
  import("../../../../../../../lib/db/purchased-route-artifact"));
vi.mock("@/lib/payments/payment-context", async () =>
  import("../../../../../../../lib/payments/payment-context"));
vi.mock("@/lib/payments/reveal-proof", async () =>
  import("../../../../../../../lib/payments/reveal-proof"));
vi.mock("@/lib/payments/reveal-error", async () =>
  import("../../../../../../../lib/payments/reveal-error"));
vi.mock("@/lib/payments/terms", async () =>
  import("../../../../../../../lib/payments/terms"));
vi.mock("@/lib/payments/config", () => ({
  readPaymentConfig: () => { throw new Error("Recovery must not load payment config"); },
}));
vi.mock("@/lib/payments/credential", () => ({
  validatePaymentCredential: () => { throw new Error("Recovery must not validate a credential"); },
}));
vi.mock("@/lib/payments/payment-balance", () => ({
  readPaymentBalanceStatus: () => { throw new Error("Recovery must not read a payment balance"); },
}));
vi.mock("@/lib/payments/server", () => ({
  createPaymentServer: () => { throw new Error("Recovery must not call the payment server"); },
}));

import { POST } from "./route";

const config = {
  COBIA_TREASURY: "0x3333333333333333333333333333333333333333" as const,
  PAYMENT_REALM: "pay.cobia.example",
};

async function setupRecovery(adapterRegistryHash?: `0x${string}`) {
  const fixture = await createRepositoryFixtureV2();
  const policy = StablecoinPolicyV2Schema.parse(fixture.policy);
  let snapshot = fixture.snapshot;
  let bundle = fixture.bundle;
  let verdict = fixture.verdict;
  let quote = fixture.quote;
  if (adapterRegistryHash) {
    snapshot = { ...snapshot, adapterRegistryHash };
    const signableInput: Record<string, unknown> = {
      ...bundle,
      snapshotHash: commitment(snapshot),
    };
    delete signableInput.signature;
    const signable = RouteBundleV2Schema.omit({ signature: true }).parse(signableInput);
    bundle = {
      ...signable,
      signature: await repositoryTestAccount.signMessage({
        message: { raw: commitment(signable) },
      }),
    };
    const bundleHash = commitment(bundle);
    verdict = { ...verdict, bundleHash };
    quote = { ...quote, quoteId: bundleHash, bundleHash };
  }
  const context = {
    ...fixture,
    policy,
    snapshot,
    bundle,
    verdict,
    quote,
    quoteCreatedAt: new Date(repositoryTestNowSec * 1_000),
  };
  const terms = buildContextPaymentTerms(context, config);
  const proof = buildRevealProof({
    realm: terms.realm,
    requestId: policy.requestId,
    quoteId: context.quote.quoteId,
    owner: policy.owner,
    paymentChainId: terms.paymentChainId,
    executionChainId: policy.executionChainId,
    paymentTermsHash: hashPaymentTerms(terms),
    nonce: commitment({ nonce: "v2-recovery" }),
    expiresAt: repositoryTestNowSec + 240,
  });
  const ownerSignature = await repositoryTestAccount.signMessage({
    message: { raw: revealProofCommitment(proof) },
  });
  const receiptHash = commitment({ receipt: "v2-recovery" });
  const attempt = {
    id: crypto.randomUUID(),
    state: "settled",
    quoteId: context.quote.quoteId,
    payer: policy.owner,
    paymentTerms: terms,
    paymentTermsHash: hashPaymentTerms(terms),
    receiptTimestamp: new Date((repositoryTestNowSec + 30) * 1_000),
  };
  const purchase = {
    id: context.quote.quoteId,
    requestId: policy.requestId,
    quoteId: context.quote.quoteId,
    buyer: policy.owner,
    executionChainId: policy.executionChainId,
    paymentChainId: terms.paymentChainId,
    paymentId: attempt.id,
    receiptHash,
    bundle: context.bundle,
    purchasedAt: attempt.receiptTimestamp,
  };
  const finalized = {
    payment: { ...attempt, state: "finalized", receiptHeader: "v2-receipt", receiptHash },
    purchase,
  };
  Object.assign(state, { context, attempt, finalized });
  return { fixture, context, policy, proof, ownerSignature, finalized };
}

function recover(input: Awaited<ReturnType<typeof setupRecovery>>) {
  return POST(new Request("https://cobia.example/reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof: input.proof, ownerSignature: input.ownerSignature }),
  }), { params: Promise.resolve({
    id: input.policy.requestId,
    quoteId: input.context.quote.quoteId,
  }) });
}

describe("V2 paid reveal recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(repositoryTestNowSec * 1_000);
    state.finalizeCalls = 0;
  });

  afterEach(() => vi.useRealTimers());

  it("returns the exact V2 policy, snapshot, and bundle after owner reauthentication", async () => {
    const input = await setupRecovery();
    const response = await recover(input);
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.route).toMatchObject({
      policy: { version: 2, requestId: input.policy.requestId },
      snapshot: { version: 2, requestId: input.policy.requestId },
      bundle: { version: 2, requestId: input.policy.requestId },
      rehearsalRealm: "pay.cobia.example",
      rehearsal: null,
    });
    expect(body.route.snapshot).toStrictEqual(input.context.snapshot);
    expect(body.route).not.toHaveProperty("paymentId");
    expect(state.finalizeCalls).toBe(1);
  });

  it("fails closed when a finalized purchase does not commit to its route", async () => {
    const input = await setupRecovery();
    state.finalized = {
      ...input.finalized,
      purchase: {
        ...input.finalized.purchase,
        bundle: { ...input.finalized.purchase.bundle,
          validUntil: input.finalized.purchase.bundle.validUntil - 1 },
      },
    };

    const response = await recover(input);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("REVEAL_REJECTED");
    expect(body).not.toHaveProperty("route");
  });

  it("recovers a settled artifact under its captured historical registry only", async () => {
    const historicalRegistry = `0x${"de".repeat(32)}` as const;
    const input = await setupRecovery(historicalRegistry);

    const response = await recover(input);
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.route.snapshot.adapterRegistryHash).toBe(historicalRegistry);
    expect(body.route).not.toHaveProperty("executable");
    expect(body.route).not.toHaveProperty("routeAuthorized");
  });
});
