// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type {
  RouteQuoteV2,
  RouteSnapshotV2,
  StablecoinPolicyV2,
} from "@cobia/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletProvider } from "../wallet/WalletProvider";
import { CompetitionView } from "./CompetitionView";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}` as const;
const nowSec = 1_900_000_000;
const policy: StablecoinPolicyV2 = {
  version: 2,
  requestId,
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  principalAtomic: "25000000000",
  protocolExposureBps: 4_000,
  minTvlUsdE6: "500000000000",
  minPreGasApyBps: 5,
  maxSnapshotAgeSec: 300,
  deadline: nowSec + 300,
  noBridges: true,
  allowedOutputAssets: [
    "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  ],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 50,
  horizonDays: 30,
};
const quote: RouteQuoteV2 = {
  version: 2,
  quoteId,
  requestId,
  solverId: "deterministic-v2",
  solverAddress: "0x1111111111111111111111111111111111111111",
  bundleHash: quoteId,
  estimatedPreGasApyBps: 9,
  riskGrade: "unassessed",
  priceAtomic: "100000",
  validUntil: nowSec + 300,
  authorization: { routeAuthorized: true, errorCodes: [] },
};

const aaveSnapshot: RouteSnapshotV2 = {
  version: 2,
  requestId,
  chainId: 196,
  blockNumber: "67649362",
  blockHash: `0x${"12".repeat(32)}`,
  capturedAt: "2030-03-17T17:46:40.000Z",
  adapterRegistryHash: `0x${"13".repeat(32)}`,
  scannedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  valuations: [{ asset: policy.asset, decimals: 6, priceUsdE8: "100000000" }],
  opportunities: [{
    id: "aave-v3:usdg",
    kind: "aave-v3-supply",
    adapterId: "aave-v3@1",
    asset: policy.asset,
    supplyRateBps: 24,
    tvlUsdE6: "500000000000",
    availableLiquidityAtomic: "1000000000",
    validatedSupplyAtomic: "10000000000",
  }],
};

function market(selected: boolean) {
  return {
    requestId,
    state: selected ? "selected" : "quotes_ready",
    policy,
    snapshot: null,
    selectedQuoteId: selected ? quoteId : null,
    purchasedRouteId: null,
    paymentRecovery: "none",
    freshness: { observedAtSec: nowSec, nextExpirySec: quote.validUntil },
    quotes: [quote],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompetitionView V2 route quote", () => {
  it("describes only the protocols present in the pinned snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      snapshot: aaveSnapshot,
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByRole("heading", { name: "Deterministic X Layer route quote" }))
      .toBeVisible();
    expect(screen.getByText(/Pinned Aave V3 opportunity data was read at one X Layer block/i))
      .toBeVisible();
    expect(screen.queryByText(/Uniswap V3/i)).not.toBeInTheDocument();
  });

  it("shows only truthful pre-gas route authorization metrics and remains selectable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market(false))));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("deterministic-v2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Deterministic X Layer route quote" }))
      .toBeVisible();
    expect(screen.getByText("Estimated pre-gas APY")).toBeVisible();
    expect(screen.getByText("0.09%")).toBeVisible();
    expect(screen.getByText("Route authorization")).toBeVisible();
    expect(screen.getByText("Authorized")).toBeVisible();
    expect(screen.queryByText("Net APY")).not.toBeInTheDocument();
    expect(screen.queryByText("Verifier score")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select quote" })).toBeEnabled();
  });

  it("offers the shared paid reveal after V2 selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market(true))));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByRole("button", { name: "Pay & reveal bundle" })).toBeEnabled();
    expect(screen.getByText("0.09 to quote signer")).toBeVisible();
    expect(screen.getByText("0.01 to Cobia")).toBeVisible();
    expect(screen.queryByText(/not wired/i)).not.toBeInTheDocument();
  });

  it("describes an empty V2 result as route authorization, not executability", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      freshness: { observedAtSec: nowSec, nextExpirySec: null },
      quotes: [],
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText(/No route-authorized quote remains/i)).toBeVisible();
    expect(screen.queryByText(/verifier-executable/i)).not.toBeInTheDocument();
  });
});
