import { describe, expect, it, vi } from "vitest";

const dependencySecret = "postgres://internal-user:private-password@database.internal/cobia";

vi.mock("@/lib/runtime/market", () => ({
  getRequestRepository: () => ({
    getPaymentContext: async () => { throw new Error(dependencySecret); },
  }),
  getPaymentRepository: () => ({}),
}));
vi.mock("@/lib/payments/credential", () => ({ validatePaymentCredential: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ readPaymentConfig: vi.fn() }));
vi.mock("@/lib/db/purchased-route-artifact", async () =>
  import("../../../../../../../lib/db/purchased-route-artifact"));
vi.mock("@/lib/payments/payment-context", () => ({
  buildContextPaymentTerms: vi.fn(),
  validateContextPaymentTerms: vi.fn(),
  verifyCurrentExecutablePaymentContext: vi.fn(),
  verifySettledRevealPaymentContext: vi.fn(),
}));
vi.mock("@/lib/payments/reveal-proof", async () =>
  import("../../../../../../../lib/payments/reveal-proof"));
vi.mock("@/lib/payments/reveal-error", async () =>
  import("../../../../../../../lib/payments/reveal-error"));
vi.mock("@/lib/payments/server", () => ({ createPaymentServer: vi.fn() }));
vi.mock("@/lib/payments/terms", () => ({
  hashPaymentTerms: vi.fn(),
  paymentTermsToChargeOptions: vi.fn(),
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}`;

describe("paid reveal error boundary", () => {
  it("does not reflect a raw dependency error to the client", async () => {
    const response = await POST(new Request("https://cobia.example/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proof: {
          version: 1,
          action: "cobia.reveal.v1",
          realm: "pay.cobia.example",
          requestId,
          quoteId,
          owner: "0x1111111111111111111111111111111111111111",
          paymentChainId: 1952,
          executionChainId: 196,
          paymentTermsHash: `0x${"cd".repeat(32)}`,
          nonce: `0x${"ef".repeat(32)}`,
          expiresAt: 2_000_000_000,
        },
        ownerSignature: `0x${"12".repeat(65)}`,
      }),
    }), {
      params: Promise.resolve({ id: requestId, quoteId }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      code: "REVEAL_REJECTED",
      message: "Paid reveal could not be completed. Retry from the request page.",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain(dependencySecret);
  });
});
