import { Challenge } from "@okxweb3/mpp";
import { commitment } from "@cobia/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositoryFixture, repositoryTestNowSec } from "../../../../../../../lib/db/repository-test-fixtures";
import { buildRevealProof, revealProofCommitment } from "../../../../../../../lib/payments/reveal-proof";
import { buildContextPaymentTerms } from "../../../../../../../lib/payments/payment-context";
import { hashPaymentTerms } from "../../../../../../../lib/payments/terms";
const state = vi.hoisted(() => ({
  attempt: {} as Record<string, unknown>, challengeId: "challenge-1", advanceAfterCredentialToSec: 0,
  advanceAfterProofToSec: 0, balanceCalls: 0, balanceRejected: false,
  beginCalls: 0, bindCalls: 0, boundChallenge: "", chargeCalls: 0, credentialBindCalls: 0,
  context: undefined as unknown, existing: undefined as unknown, advanceAtContextCall: 0,
  advanceToSec: 0, contextCalls: 0, configCalls: 0, configRejected: false,
  paymentConfig: undefined as unknown, credentialCalls: 0, credentialRejected: false, finalizeCalls: 0,
  options: undefined as unknown, proofCalls: 0, recordCalls: 0, realm: "", rawReceipt: "",
}));
const config = {
  MPPX_SECRET_KEY: "m".repeat(32), COBIA_TREASURY: "0x3333333333333333333333333333333333333333" as const,
  PAYMENT_REALM: "pay.cobia.example", PAYMENT_CHAIN_ID: 1952 as const, PAYMENT_DECIMALS: 6 as const,
  PAYMENT_ASSET: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c" as const,
};
vi.mock("@/lib/payments/config", () => ({ readPaymentConfig: () => {
  state.configCalls += 1; if (state.configRejected) throw new Error("payment config unavailable");
  return state.paymentConfig ?? config;
} }));
vi.mock("@/lib/db/purchased-route-artifact", async () => import("../../../../../../../lib/db/purchased-route-artifact"));
vi.mock("@/lib/payments/payment-context", async () => import("../../../../../../../lib/payments/payment-context"));
vi.mock("@/lib/payments/reveal-error", async () => import("../../../../../../../lib/payments/reveal-error"));
vi.mock("@/lib/payments/terms", async () => import("../../../../../../../lib/payments/terms"));
vi.mock("@/lib/payments/reveal-proof", async () => {
  const actual = await import("../../../../../../../lib/payments/reveal-proof");
  return {
    ...actual,
    verifyRevealProof: async (proof: unknown) => {
      state.proofCalls += 1;
      const parsed = actual.RevealProofSchema.parse(proof);
      if (parsed.expiresAt <= Math.floor(Date.now() / 1_000)) throw new Error("expired");
      if (state.advanceAfterProofToSec) vi.setSystemTime(state.advanceAfterProofToSec * 1_000);
      return parsed;
    },
    verifyRevealRecoveryProof: async (proof: unknown, _signature: unknown, _context: unknown, nowSec: number) => {
      const parsed = actual.RevealProofSchema.parse(proof);
      if (parsed.expiresAt <= nowSec || parsed.expiresAt > nowSec + 300) throw new Error("recovery expired");
      return parsed;
    },
  };
});
vi.mock("@/lib/payments/credential", () => ({
  validatePaymentCredential: (request: Request) => {
    state.credentialCalls += 1;
    if (state.credentialRejected) throw new Error("credential rejected");
    if (state.advanceAfterCredentialToSec) vi.setSystemTime(state.advanceAfterCredentialToSec * 1_000);
    return { credential: { challenge: { id: state.challengeId } },
      authorization: { validAfter: `${repositoryTestNowSec - 60}` },
      authorizationHeader: request.headers.get("authorization") };
  },
}));
vi.mock("@/lib/payments/payment-balance", () => ({
  readPaymentBalanceStatus: async () => (state.balanceCalls += 1, {
    available: state.balanceRejected ? 0n : 100_000n,
    required: 100_000n, sufficient: !state.balanceRejected,
  }),
}));
vi.mock("@/lib/payments/server", () => ({
  createPaymentServer: (realm: string) => {
    state.realm = realm;
    return {
      charge: (options: unknown) => {
        state.options = options;
        return async (request: Request) => {
          state.chargeCalls += 1;
          if (!request.headers.has("authorization")) {
            const chargeOptions = options as {
              amount: string; currency: string; recipient: string; externalId: string;
              methodDetails: Record<string, unknown>;
              description?: string; expires?: string; meta?: Record<string, string>;
            };
            const challenge = Challenge.from({
              id: state.challengeId, realm, method: "evm", intent: "charge", meta: chargeOptions.meta,
              description: chargeOptions.description, expires: chargeOptions.expires, request: {
                amount: chargeOptions.amount, currency: chargeOptions.currency,
                recipient: chargeOptions.recipient, externalId: chargeOptions.externalId,
                methodDetails: chargeOptions.methodDetails },
            });
            return {
              status: 402 as const,
              challenge: new Response(null, { status: 402,
                headers: { "WWW-Authenticate": Challenge.serialize(challenge) } }),
            };
          }
          return {
            status: 200 as const,
            withReceipt: (response: Response) => {
              const headers = new Headers(response.headers);
              headers.set("Payment-Receipt", state.rawReceipt);
              return new Response(response.body, { status: response.status, headers });
            },
          };
        };
      },
    };
  },
}));
vi.mock("@/lib/runtime/market", () => ({
  getRequestRepository: () => ({
    getPaymentContext: async () => {
      state.contextCalls += 1;
      if (state.contextCalls === state.advanceAtContextCall) vi.setSystemTime(state.advanceToSec * 1_000);
      return state.context;
    },
  }),
  getPaymentRepository: () => ({
    getPaymentByRequest: async () => state.existing,
    beginPayment: async () => (state.beginCalls += 1, state.attempt),
    bindChallenge: async (_id: string, challengeId: string) => (
      state.bindCalls += 1, state.boundChallenge = challengeId, state.attempt
    ),
    bindCredential: async () => (state.credentialBindCalls += 1, state.attempt),
    recordSettlement: async () => (state.recordCalls += 1, {
      ...state.attempt, state: "settled", receiptHeader: state.rawReceipt,
      receiptHash: commitment({ receipt: state.rawReceipt }),
      receiptTimestamp: new Date((repositoryTestNowSec + 30) * 1_000),
    }),
    finalizePayment: async () => {
      state.finalizeCalls += 1;
      const context = state.context as Awaited<ReturnType<typeof createRepositoryFixture>>;
      return { payment: {
        ...state.attempt, state: "finalized", receiptHeader: state.rawReceipt,
        receiptHash: commitment({ receipt: state.rawReceipt }), receiptTimestamp: new Date((repositoryTestNowSec + 30) * 1_000),
      }, purchase: {
        id: context.quote.quoteId, requestId: context.policy.requestId,
        quoteId: context.quote.quoteId, buyer: context.policy.owner.toLowerCase(),
        executionChainId: 196, paymentChainId: 1952, paymentId: state.attempt.id,
        receiptHash: commitment({ receipt: state.rawReceipt }), bundle: context.bundle,
        purchasedAt: new Date((repositoryTestNowSec + 30) * 1_000),
      } };
    },
  }),
}));
import { POST } from "./route";
async function setup() {
  const fixture = await createRepositoryFixture();
  const context = { ...fixture, quoteCreatedAt: new Date(repositoryTestNowSec * 1_000) };
  const terms = buildContextPaymentTerms(context, config);
  const proof = buildRevealProof({
    realm: terms.realm, requestId: fixture.policy.requestId,
    quoteId: fixture.quote.quoteId, owner: fixture.policy.owner,
    paymentChainId: terms.paymentChainId, executionChainId: fixture.policy.executionChainId,
    paymentTermsHash: hashPaymentTerms(terms), nonce: commitment({ nonce: "route-test" }), expiresAt: terms.expiresAt,
  });
  const receipt = { method: "evm", reference: commitment({ reference: "route-test" }), status: "success",
    timestamp: new Date((repositoryTestNowSec + 30) * 1_000).toISOString(), chainId: 1952,
    challengeId: state.challengeId, externalId: fixture.quote.quoteId };
  state.context = context; state.existing = undefined;
  state.rawReceipt = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  state.attempt = {
    id: crypto.randomUUID(), state: "pending", challengeId: state.challengeId,
    quoteId: fixture.quote.quoteId, paymentTermsHash: proof.paymentTermsHash,
    payer: fixture.policy.owner.toLowerCase(), paymentTerms: terms, revealProofHash: revealProofCommitment(proof),
    credentialHash: null, receiptHeader: null, receiptHash: null, receiptTimestamp: null,
  };
  return { fixture, proof, body: { proof, ownerSignature: `0x${"ab".repeat(65)}` } };
}
function post(input: Awaited<ReturnType<typeof setup>>, authorized = false) {
  return POST(new Request(
    `https://attacker.example/api/requests/${input.fixture.policy.requestId}/quotes/${input.fixture.quote.quoteId}/reveal`,
    { method: "POST", headers: { "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Payment credential" } : {}) },
    body: JSON.stringify(input.body) },
  ), { params: Promise.resolve({ id: input.fixture.policy.requestId,
    quoteId: input.fixture.quote.quoteId }) });
}
describe("paid reveal orchestration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(repositoryTestNowSec * 1_000);
    Object.assign(state, {
      advanceAfterCredentialToSec: 0, advanceAfterProofToSec: 0,
      advanceAtContextCall: 0, advanceToSec: 0, balanceCalls: 0, balanceRejected: false,
      beginCalls: 0, bindCalls: 0, boundChallenge: "", chargeCalls: 0,
      challengeId: "challenge-1", contextCalls: 0, credentialCalls: 0,
      configCalls: 0, configRejected: false, paymentConfig: undefined,
      credentialBindCalls: 0, credentialRejected: false, finalizeCalls: 0, options: undefined,
      proofCalls: 0, recordCalls: 0, realm: "",
    });
  });
  afterEach(vi.useRealTimers);
  it("persists owner proof before issuing the canonical bound challenge", async () => {
    const input = await setup();
    const response = await post(input);
    expect([response.status, response.headers.get("Cache-Control")], await response.clone().text()).toEqual([402, "no-store"]);
    expect(state.proofCalls).toBe(1);
    expect(state.credentialCalls).toBe(0);
    expect(state.realm).toBe(config.PAYMENT_REALM);
    expect(state.options).toMatchObject({
      externalId: input.fixture.quote.quoteId,
      expires: new Date(input.proof.expiresAt * 1_000).toISOString(),
      meta: { paymentId: state.attempt.id, revealProofHash: revealProofCommitment(input.proof) },
    });
  });
  it("preflights the credential, settles, persists the receipt, and finalizes", async () => {
    const input = await setup();
    const response = await post(input, true); const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(response.headers.get("Payment-Receipt")).toBe(state.rawReceipt);
    expect(body.route).toMatchObject({
      id: input.fixture.quote.quoteId, executionChainId: 196, paymentChainId: 1952 });
    expect([state.credentialCalls, state.chargeCalls, state.recordCalls, state.finalizeCalls])
      .toEqual([1, 1, 1, 1]);
    expect(state.contextCalls).toBeGreaterThanOrEqual(2);
  });
  it("rejects a bad credential before any settlement call or write", async () => {
    const input = await setup();
    state.credentialRejected = true;
    const response = await post(input, true);
    const body = await response.json();
    expect({ status: response.status, code: body.code, message: body.message }).toEqual({ status: 409,
      code: "PAYMENT_CREDENTIAL_REJECTED", message: "Payment credential is invalid or expired." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("credential rejected");
    expect([state.credentialCalls, state.chargeCalls, state.recordCalls, state.finalizeCalls])
      .toEqual([1, 0, 0, 0]);
  });
  it("rejects insufficient payment funds before binding a credential or calling the provider", async () => {
    const input = await setup(); state.balanceRejected = true;
    const response = await post(input, true); const body = await response.json();
    expect([response.status, body.code, body.message]).toEqual([409, "PAYMENT_BALANCE_INSUFFICIENT",
      "Insufficient USDt0 balance on X Layer Mainnet. Fund 0.10 USDt0 before paying."]);
    expect([state.balanceCalls, state.credentialBindCalls, state.chargeCalls])
      .toEqual([1, 0, 0]);
  });
  it("rejects a non-executable context before persisting a payment attempt", async () => {
    const input = await setup();
    const context = state.context as Awaited<ReturnType<typeof createRepositoryFixture>>;
    state.context = {
      ...context,
      quote: { ...context.quote, verification: { ...context.quote.verification, executable: false } },
    };
    expect((await post(input)).status).toBe(409);
    expect([state.beginCalls, state.chargeCalls]).toEqual([0, 0]);
  });
  it("rejects expiry crossed before the pending payment write", async () => {
    const input = await setup();
    state.advanceAfterProofToSec = input.proof.expiresAt;
    const response = await post(input);
    expect({ status: response.status, begin: state.beginCalls, charge: state.chargeCalls })
      .toEqual({ status: 409, begin: 0, charge: 0 });
  });
  it("rejects expiry crossed before binding a credential", async () => {
    const input = await setup();
    state.existing = state.attempt;
    state.advanceAfterCredentialToSec = input.proof.expiresAt;
    const response = await post(input, true);
    expect({ status: response.status, bind: state.credentialBindCalls, charge: state.chargeCalls })
      .toEqual({ status: 409, bind: 0, charge: 0 });
  });
  it("rechecks current time immediately before calling the payment provider", async () => {
    const input = await setup();
    state.advanceAtContextCall = 2;
    state.advanceToSec = input.proof.expiresAt;
    const response = await post(input, true);
    expect({ status: response.status, bind: state.credentialBindCalls,
      charge: state.chargeCalls, record: state.recordCalls })
      .toEqual({ status: 409, bind: 0, charge: 0, record: 0 });
  });
  it("resumes an uncredentialed pending attempt with a fresh owner proof", async () => {
    const input = await setup();
    state.attempt = { ...state.attempt, challengeId: "old-challenge" };
    state.existing = state.attempt;
    state.paymentConfig = { ...config, PAYMENT_REALM: "rotated.cobia.example" };
    state.challengeId = "replacement-challenge";
    input.body.proof = { ...input.proof, nonce: commitment({ nonce: "reloaded-owner" }) };
    const response = await post(input);
    expect(response.status, await response.clone().text()).toBe(402);
    expect({ begin: state.beginCalls, bind: state.bindCalls, charge: state.chargeCalls })
      .toEqual({ begin: 0, bind: 1, charge: 1 });
    expect(state.boundChallenge).toBe("replacement-challenge");
    expect(state.options).toMatchObject({ meta: { revealProofHash: state.attempt.revealProofHash } });
  });
  it("reauthenticates an expired stored settlement without charging again", async () => {
    const input = await setup();
    state.attempt = { ...state.attempt, state: "settled", receiptHeader: state.rawReceipt,
      receiptTimestamp: new Date((repositoryTestNowSec + 30) * 1_000),
    };
    state.existing = state.attempt; vi.setSystemTime(input.proof.expiresAt * 1_000);
    input.body.proof = { ...input.proof, expiresAt: input.proof.expiresAt + 300 };
    state.configRejected = true; state.advanceAtContextCall = 1;
    state.advanceToSec = input.body.proof.expiresAt;
    const staleResponse = await post(input);
    expect({ status: staleResponse.status, finalize: state.finalizeCalls })
      .toEqual({ status: 409, finalize: 0 });
    state.contextCalls = 0; state.advanceAtContextCall = 0;
    vi.setSystemTime(input.proof.expiresAt * 1_000);
    input.body.proof = { ...input.body.proof, expiresAt: input.proof.expiresAt + 240 };
    const response = await post(input);
    expect(response.status, await response.clone().text()).toBe(200);
    expect([state.beginCalls, state.chargeCalls, state.finalizeCalls, state.configCalls])
      .toEqual([0, 0, 1, 0]);
  });
});
