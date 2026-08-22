// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { commitment } from "@cobia/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTENT_ASSETS } from "../../lib/intents/capability-templates";
import { IntentComposer } from "./IntentComposer";

const owner = "0x1111111111111111111111111111111111111111";
const state = vi.hoisted(() => ({ push: vi.fn(), request: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({ account: owner, chainId: 196, targetChainId: 196,
    request: state.request, switchChain: vi.fn(), switchToXLayer: vi.fn() }),
}));

const composed = {
  kind: "composed", inputToken: INTENT_ASSETS[0]!.address, amount: "1",
  terminalAsset: INTENT_ASSETS[1]!.address,
  capabilityIds: ["aave-v3.supply", "curve-stableswap-ng.exact-input",
    "uniswap-v3.exact-input"],
  maxConversionLossBps: 100, minimumReceiptValueBps: 9_900,
  minimumReceiptSource: "conversion-loss", horizonDays: 30,
  horizonSource: "product-default", competitionDurationSec: 300,
  deadlineDurationSec: 600,
};

function composerFetch(url: string, publish = false) {
  if (url === "/api/intents/compile") return Response.json({ status: "review", values: composed });
  if (url.startsWith(`/api/wallets/${owner}/portfolio`)) return Response.json({ balances: [] });
  if (url === "/api/assets/resolve") return Response.json({ assets: [] });
  if (url === "/api/commerce/discover?limit=12") return Response.json({ offers: [] });
  return Response.json(publish ? { links: { intent: "/intents/composed" } } : {}, { status: publish ? 202 : 404 });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  state.push.mockReset();
  state.request.mockReset().mockResolvedValue(`0x${"ab".repeat(65)}`);
});

describe("IntentComposer registered composition", () => {
  it("reviews the exact multi-step yield goal as one composition", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve(composerFetch(url))));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), { target: { value:
      "Use at most 1 USDG to enter the best verified stablecoin-yield route ending in USDt0 on X Layer. " +
      "Only use Aave V3, Curve or Uniswap. Allow no more than 1% conversion loss, " +
      "require a minimum receipt-token balance, and expire in ten minutes.",
    } });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("heading", { name: "Registered composition" })).toBeVisible();
    expect(screen.queryByLabelText("Verified capability")).not.toBeInTheDocument();
    expect(screen.queryByText(/Which supplied template/)).not.toBeInTheDocument();
    expect(screen.getByText("Curve StableSwap NG exact input")).toBeVisible();
  });

  it("signs and posts the exact reviewed policy commitment", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(composerFetch(url, url === "/api/intents")));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Use 1 USDG for the best registered stablecoin yield route." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));
    await screen.findByRole("heading", { name: "Registered composition" });

    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/intents")).toBe(true));
    const publishRequest = fetchMock.mock.calls.find(([url]) => url === "/api/intents");
    const body = JSON.parse(String(publishRequest?.[1]?.body));
    expect(body.policy).toMatchObject({
      version: 1, kind: "capability-composition",
      input: { token: INTENT_ASSETS[0]!.address.toLowerCase(), maxAtomic: "1000000" },
      competition: { maxRevisionsPerSolver: 5 },
      constraints: [
        { kind: "maximum-conversion-loss", maximumLossBps: 100 },
        { kind: "minimum-registered-receipt-value", minimumValueBps: 9_900 },
        { kind: "required-terminal-asset", asset: INTENT_ASSETS[1]!.address.toLowerCase() },
      ],
      objective: { kind: "maximize-net-yield", horizonDays: 30 },
    });
    expect(state.request).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
  });
});
