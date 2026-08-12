// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositoryFixtureV2 } from "../../lib/db/repository-test-fixtures";
import type { MainnetExecutionSessionV2 } from "../../lib/execution-v2/mainnet-execution-client";
import type { ExecutionRehearsalTrace } from "../../lib/execution-v2/rehearsal-trace";
import type { PurchasedRouteV2 } from "./purchased-route";

const client = vi.hoisted(() => ({
  start: vi.fn(),
  submit: vi.fn(),
  advance: vi.fn(),
}));
const buyer = "0xb27d2303b6ecbd4d175641c0b825d2210798f1d4" as const;
const wallet = vi.hoisted(() => ({
  account: "0xb27d2303b6ecbd4d175641c0b825d2210798f1d4" as `0x${string}` | null,
  request: vi.fn(),
  switchToXLayer: vi.fn(),
}));

vi.mock("../../lib/execution-v2/mainnet-execution-client", () => ({
  startMainnetExecutionV2: client.start,
  submitMainnetExecutionStepV2: client.submit,
  advanceMainnetExecutionV2: client.advance,
}));
vi.mock("../wallet/WalletProvider", () => ({ useWallet: () => wallet }));

import { MainnetExecutionLedger } from "./MainnetExecutionLedger";

const trace: ExecutionRehearsalTrace = {
  version: 1, mode: "xlayer-mainnet-fork", engineVersion: "execution-v2@1",
  routeId: `0x${"11".repeat(32)}`, bundleHash: `0x${"11".repeat(32)}`,
  registryHash: `0x${"22".repeat(32)}`, executionChainId: 196,
  buyer, principalAtomic: "10000000",
  snapshot: { blockNumber: "67649362", blockHash: `0x${"33".repeat(32)}`,
    capturedAt: "2026-08-11T08:00:00.000Z" },
  result: { status: "success", transactions: [] },
};

function session(state: "active" | "complete" = "active"): MainnetExecutionSessionV2 {
  return {
    attempt: { id: "e35833b3-076c-4879-bdb6-cd90c17bdf63",
      routeId: trace.routeId, buyer, executionChainId: 196,
      state, nextOrdinal: 0, failureCode: null },
    steps: [],
    preparedStep: state === "active" ? {
      ordinal: 0, state: "prepared", kind: "approval", from: buyer,
      to: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", valueAtomic: "0",
      calldata: "0x1234", calldataHash: `0x${"44".repeat(32)}`,
      semantic: { version: 1, label: "approve-aave-exact", phase: "initial",
        authorizedAmountAtomic: "10000000", capturedState: { kind: "allowance",
          token: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
          spender: "0xe3f3caefdd7180f884c01e57f65df979af84f116",
          expectedAtomic: "10000000", beforeAtomic: "0" } },
      preBlockNumber: "67649362", preBlockHash: `0x${"33".repeat(32)}`,
      expectedNonce: "4", gasEstimateAtomic: "52000",
    } : null,
    token: "header.payload", tokenExpiresAt: 2_000_000_240,
  };
}

async function route(): Promise<PurchasedRouteV2> {
  const fixture = await createRepositoryFixtureV2();
  return {
    id: trace.routeId, requestId: fixture.policy.requestId, quoteId: trace.routeId,
    buyer, executionChainId: 196, paymentChainId: 1952,
    receiptHash: `0x${"77".repeat(32)}`, purchasedAt: "2026-08-11T08:00:00.000Z",
    policy: fixture.policy, snapshot: fixture.snapshot, bundle: fixture.bundle,
    rehearsalRealm: "localhost:3000", rehearsal: { id: crypto.randomUUID(), state: "passed", trace },
  };
}

describe("MainnetExecutionLedger", () => {
  beforeEach(() => {
    wallet.account = buyer;
    client.start.mockReset().mockResolvedValue(session());
    client.submit.mockReset().mockResolvedValue(session("complete"));
    client.advance.mockReset();
  });
  afterEach(cleanup);

  it("makes the real-funds boundary explicit and separates authorization from sending", async () => {
    render(<MainnetExecutionLedger route={await route()} trace={trace} />);
    expect(screen.getByText(/real mainnet funds/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start verified mainnet execution" }));
    await screen.findByText("Approve Aave exact amount");
    expect(client.start).toHaveBeenCalledOnce();
    expect(client.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Review in wallet: Approve Aave/i }));
    await screen.findByText("Route execution complete");
    expect(client.submit).toHaveBeenCalledOnce();
  });

  it("does not authorize another connected wallet", async () => {
    wallet.account = "0x9999999999999999999999999999999999999999";
    render(<MainnetExecutionLedger route={await route()} trace={trace} />);
    expect(screen.getByText(/Connect the purchasing wallet/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start verified mainnet execution" })).toBeDisabled();
    await waitFor(() => expect(client.start).not.toHaveBeenCalled());
  });
});
