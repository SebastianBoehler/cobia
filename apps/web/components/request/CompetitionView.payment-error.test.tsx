// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { RouteQuoteV2, StablecoinPolicyV2 } from "@cobia/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaymentTerms } from "../../lib/payments/terms";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}` as const;
const owner = "0x1111111111111111111111111111111111111111";
const wallet = vi.hoisted(() => ({
  account: "0x1111111111111111111111111111111111111111" as `0x${string}`,
  request: vi.fn(async () => `0x${"cd".repeat(65)}`),
  switchChain: vi.fn(),
  switchToXLayer: vi.fn(),
}));

vi.mock("../wallet/WalletProvider", () => ({ useWallet: () => wallet }));
vi.mock("../../lib/payments/eip3009", () => ({
  authorizePayment: vi.fn(async () => "Payment credential"),
}));

import { CompetitionView } from "./CompetitionView";

const policy = {
  version: 1 as const,
  requestId,
  owner,
  executionChainId: 196 as const,
  asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true as const,
};
const quote = {
  version: 1 as const,
  quoteId,
  requestId,
  solverId: "determinist",
  solverAddress: owner,
  bundleHash: quoteId,
  expectedNetApyBps: 100,
  riskGrade: "unassessed" as const,
  priceAtomic: "100000",
  validUntil: 2_000_000_000,
  verification: { executable: true, errorCodes: [], score: 100 },
};
const paymentTerms = buildPaymentTerms({
  quote,
  solver: owner,
  treasury: "0x3333333333333333333333333333333333333333",
  realm: "pay.cobia.example",
  issuedAt: 1_999_999_700,
  cutoff: 2_000_000_000,
});

const v2Policy: StablecoinPolicyV2 = {
  version: 2,
  requestId,
  owner,
  executionChainId: 196,
  asset: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  principalAtomic: "25000000000",
  protocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minPreGasApyBps: 5,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
  allowedOutputAssets: ["0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"],
  allowedAdapters: ["aave-v3@1"],
  maxSlippageBps: 50,
  horizonDays: 30,
};
const v2Quote: RouteQuoteV2 = {
  version: 2,
  quoteId,
  requestId,
  solverId: "deterministic-v2",
  solverAddress: owner,
  bundleHash: quoteId,
  estimatedPreGasApyBps: 9,
  riskGrade: "unassessed",
  priceAtomic: "100000",
  validUntil: 2_000_000_000,
  authorization: { routeAuthorized: true, errorCodes: [] },
};
const v2PaymentTerms = buildPaymentTerms({
  quote: v2Quote,
  solver: owner,
  treasury: "0x3333333333333333333333333333333333333333",
  realm: "pay.cobia.example",
  issuedAt: 1_999_999_700,
  cutoff: 2_000_000_000,
});

function market(paymentRecovery: "resume" | "reconcile") {
  return {
    requestId,
    state: "payment_pending",
    policy,
    snapshot: null,
    selectedQuoteId: quoteId,
    purchasedRouteId: null,
    paymentRecovery,
    paymentTerms,
    freshness: { observedAtSec: 1_999_999_700, nextExpirySec: 2_000_000_000 },
    quotes: [quote],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CompetitionView payment failure recovery", () => {
  it("offers the selected V2 quote to the shared paid-reveal path", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return Response.json({
        requestId,
        state: "selected",
        policy: v2Policy,
        snapshot: null,
        selectedQuoteId: quoteId,
        purchasedRouteId: null,
        paymentRecovery: "none",
        paymentTerms: v2PaymentTerms,
        freshness: { observedAtSec: 1_999_999_700, nextExpirySec: 2_000_000_000 },
        quotes: [v2Quote],
      });
      return Response.json({ message: "V2 reveal reached the server" }, { status: 409 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionView requestId={requestId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pay & reveal bundle" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("V2 reveal reached the server");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body)).proof).toMatchObject({
      requestId,
      quoteId,
      owner,
      executionChainId: 196,
    });
  });

  it("reloads reconciliation state and shows the provider problem detail", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return Response.json(market(++reads === 1 ? "resume" : "reconcile"));
      if (!new Headers(init.headers).has("authorization")) return new Response(null, { status: 402 });
      return Response.json({
        title: "Payment settlement unresolved",
        detail: "Provider settlement is ambiguous; do not retry.",
      }, { status: 402 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionView requestId={requestId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume payment" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Provider settlement is ambiguous; do not retry.");
    await waitFor(() => expect(screen.getByText("Payment reconciliation required")).toBeVisible());
    expect(reads).toBe(2);
  });
});
