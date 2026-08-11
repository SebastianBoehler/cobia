// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositoryFixtureV2 } from "../../lib/db/repository-test-fixtures";
import type { ExecutionRehearsalTrace } from "../../lib/execution-v2/rehearsal-trace";
import type { PurchasedRouteV2 } from "./purchased-route";
import { PurchasedRouteExecution } from "./PurchasedRouteExecution";

const wallet = vi.hoisted(() => ({
  account: "0xb27d2303b6ecbd4d175641c0b825d2210798f1d4" as `0x${string}` | null,
  request: vi.fn(async ({ method }: { method: string }) => {
    if (method === "personal_sign") return `0x${"ab".repeat(65)}`;
    throw new Error(`Unexpected wallet method ${method}`);
  }),
}));

vi.mock("../wallet/WalletProvider", () => ({ useWallet: () => wallet }));

async function route(): Promise<PurchasedRouteV2> {
  const fixture = await createRepositoryFixtureV2();
  return {
    id: fixture.quote.quoteId,
    requestId: fixture.policy.requestId,
    quoteId: fixture.quote.quoteId,
    buyer: fixture.policy.owner.toLowerCase(),
    executionChainId: 196,
    paymentChainId: 1952,
    receiptHash: `0x${"77".repeat(32)}`,
    purchasedAt: "2026-08-11T08:00:00.000Z",
    policy: fixture.policy,
    snapshot: fixture.snapshot,
    bundle: fixture.bundle,
    rehearsalRealm: "localhost:3000",
    rehearsal: null,
  };
}

const trace: ExecutionRehearsalTrace = {
  version: 1 as const,
  mode: "xlayer-mainnet-fork" as const,
  engineVersion: "execution-v2@1" as const,
  routeId: `0x${"11".repeat(32)}` as const,
  bundleHash: `0x${"11".repeat(32)}` as const,
  registryHash: `0x${"22".repeat(32)}` as const,
  executionChainId: 196 as const,
  buyer: wallet.account!,
  principalAtomic: "10000000",
  snapshot: {
    blockNumber: "67649362",
    blockHash: `0x${"33".repeat(32)}` as const,
    capturedAt: "2026-08-11T08:00:00.000Z",
  },
  result: {
    status: "success" as const,
    transactions: [{
      label: "approve-aave-exact" as const,
      hash: `0x${"44".repeat(32)}` as const,
      preBlockNumber: "67649362",
      preBlockHash: `0x${"33".repeat(32)}` as const,
      blockNumber: "67649363",
      blockHash: `0x${"55".repeat(32)}` as const,
      transactionIndex: 0,
      gasEstimate: "52341",
      protocolEvidence: { kind: "approval", amountAtomic: "10000000" },
      stateCheck: { kind: "allowance", afterAtomic: "10000000" },
    }, {
      label: "aave-v3-supply" as const,
      hash: `0x${"66".repeat(32)}` as const,
      preBlockNumber: "67649363",
      preBlockHash: `0x${"55".repeat(32)}` as const,
      blockNumber: "67649364",
      blockHash: `0x${"77".repeat(32)}` as const,
      transactionIndex: 0,
      gasEstimate: "188000",
      protocolEvidence: { kind: "aave-supply", suppliedAtomic: "10000000" },
      stateCheck: { kind: "aave-supply", inputSpentAtomic: "10000000" },
    }],
  },
};

describe("PurchasedRouteExecution", () => {
  beforeEach(() => {
    wallet.account = "0xb27d2303b6ecbd4d175641c0b825d2210798f1d4";
    wallet.request.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      rehearsalId: "34aa3307-a77b-47c5-a140-ae3d07503dca",
      state: "passed",
      trace,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
  });

  afterEach(cleanup);

  it("signs only a rehearsal proof and renders the attributed fork ledger", async () => {
    render(<PurchasedRouteExecution route={await route()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rehearse exact quote on fork" }));

    await screen.findByText("Fork rehearsal passed");
    expect(screen.getByText("No wallet funds were used.")).toBeVisible();
    expect(screen.getByText("Approve Aave exact amount")).toBeVisible();
    expect(screen.getByText("Supply to Aave V3")).toBeVisible();
    expect(wallet.request).toHaveBeenCalledOnce();
    expect(wallet.request.mock.calls[0]![0]).toMatchObject({ method: "personal_sign" });
    expect(wallet.request).not.toHaveBeenCalledWith(expect.objectContaining({
      method: "eth_sendTransaction",
    }));
  });

  it("renders a persisted passing trace without another signature", async () => {
    const purchased = await route();
    purchased.rehearsal = {
      id: "34aa3307-a77b-47c5-a140-ae3d07503dca",
      state: "passed",
      trace,
    };
    render(<PurchasedRouteExecution route={purchased} />);

    expect(screen.getByText("Fork rehearsal passed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start guided mainnet execution" })).toBeVisible();
    expect(wallet.request).not.toHaveBeenCalled();
  });

  it("blocks a connected wallet that is not the purchasing buyer", async () => {
    wallet.account = "0x9999999999999999999999999999999999999999";
    render(<PurchasedRouteExecution route={await route()} />);

    expect(screen.getByText("Connect the purchasing wallet to rehearse this quote.")).toBeVisible();
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(wallet.request).not.toHaveBeenCalled());
  });
});
