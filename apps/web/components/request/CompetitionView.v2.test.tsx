// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type {
  RouteQuoteV2,
  RouteSnapshotV2,
  StablecoinPolicyV2,
} from "@cobia/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRouteSummaryV2 } from "../../lib/markets/route-summary";
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
const routeSummary: PublicRouteSummaryV2 = {
  version: 2,
  inputAsset: policy.asset,
  inputAtomic: policy.principalAtomic,
  retainedAtomic: "15000000000",
  horizonDays: policy.horizonDays,
  steps: [{
    kind: "supply",
    protocol: "Aave V3",
    asset: policy.asset,
    inputAtomic: "10000000000",
  }],
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
    routeSummaries: { [quoteId]: routeSummary },
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

    expect((await screen.findAllByRole("heading", { name: "Best verified route" })).length)
      .toBeGreaterThan(0);
    expect(screen.getByText(/Pinned Aave V3 opportunity data was read at one X Layer block/i))
      .toBeVisible();
    expect(screen.queryByText(/Uniswap V3/i)).not.toBeInTheDocument();
  });

  it("names Curve separately when the pinned snapshot contains a Curve opportunity", async () => {
    const snapshot: RouteSnapshotV2 = {
      ...aaveSnapshot,
      scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
      opportunities: [...aaveSnapshot.opportunities, {
        id: "curve-stableswap-ng:registered-pair",
        kind: "curve-stableswap-ng-exact-input",
        adapterId: "curve-stableswap-ng@1",
        pool: "0x31F066aA0A687d4F383F96a514984AF727Eb8e38",
        tokenIn: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
        tokenOut: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        inputIndex: 0,
        outputIndex: 1,
        fee: "1000000",
        quotedInputAtomic: "10000000",
        quotedOutputAtomic: "9990000",
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      snapshot,
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText(/Pinned Aave V3 and Curve StableSwap NG opportunity data/i))
      .toBeVisible();
    expect(screen.queryByText(/Aave V3 and Uniswap V3 opportunity data/i))
      .not.toBeInTheDocument();
  });

  it("shows only truthful pre-gas route authorization metrics and remains selectable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      snapshot: aaveSnapshot,
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("deterministic-v2")).toBeVisible();
    expect(screen.getByText(/operated by Cobia/i)).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Best verified route" })).toHaveLength(2);
    expect(screen.getAllByText("You commit")).toHaveLength(2);
    expect(screen.getByText("Route outcome")).toBeVisible();
    expect(screen.getByText("Estimated 30-day yield")).toBeVisible();
    expect(screen.getByText("15,000 USDG stays in wallet")).toBeVisible();
    expect(screen.getByText("Supply 10,000 USDG")).toBeVisible();
    expect(screen.getByLabelText("Aave V3")).toBeVisible();
    expect(screen.getByText("0.09%")).toBeVisible();
    expect(screen.queryByText("Net APY")).not.toBeInTheDocument();
    expect(screen.queryByText("Verifier score")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select quote" })).toBeEnabled();
  });

  it("shows retail net economics instead of presenting APY alone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      policy: { ...policy, principalAtomic: "10000000" },
      snapshot: aaveSnapshot,
      quotes: [{ ...quote, estimatedPreGasApyBps: 41 }],
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("Not economical at this size")).toBeVisible();
    expect(screen.getByText(/Estimated 30-day gross \$0\.0034/)).toBeVisible();
    expect(screen.getByText(/reveal \$0\.10 · gas not included/i)).toBeVisible();
  });

  it("presents a Swap as a bounded token outcome rather than zero yield", async () => {
    const outputAsset = policy.allowedOutputAssets[1];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ...market(false),
      policy: {
        ...policy,
        protocolExposureBps: 10_000,
        minPreGasApyBps: 0,
        objective: { kind: "swap", outputAsset, minimumOutputAtomic: "9950000" },
      },
      snapshot: {
        ...aaveSnapshot,
        valuations: [...aaveSnapshot.valuations, {
          asset: outputAsset, decimals: 6, priceUsdE8: "100000000",
        }],
      },
      quotes: [{ ...quote, estimatedPreGasApyBps: 0 }],
      routeSummaries: { [quoteId]: {
        version: 2,
        inputAsset: policy.asset,
        inputAtomic: "10000000",
        retainedAtomic: "0",
        horizonDays: 30,
        steps: [{
          kind: "swap",
          protocol: "Uniswap V3",
          tokenIn: policy.asset,
          tokenOut: outputAsset,
          inputAtomic: "10000000",
          quotedOutputAtomic: "9990000",
          minimumOutputAtomic: "9950000",
        }],
      } },
    })));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("Minimum received")).toBeVisible();
    expect(screen.getAllByText("9.95 USDt0").length).toBeGreaterThan(0);
    expect(screen.getByText(/Expected 9\.99 USDt0/)).toBeVisible();
    expect(screen.queryByText(/Estimated 30-day yield/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Not economical at this size")).not.toBeInTheDocument();
  });

  it("offers the shared paid reveal after V2 selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market(true))));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByRole("button", { name: "Pay & reveal bundle" })).toBeEnabled();
    screen.getByText("Verification & purchase details").click();
    expect(screen.getByText("0.10 · 2 direct-recipient signatures")).toBeVisible();
    expect(screen.getByText("One purchase: 0.09 signer + 0.01 Cobia")).toBeVisible();
    expect(screen.getByText(/authorizes each recipient directly/i)).toBeVisible();
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
