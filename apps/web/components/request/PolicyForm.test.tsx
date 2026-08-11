// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { commitment } from "@cobia/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Eip1193Provider, Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { WalletButton } from "../wallet/WalletButton";
import { WalletProvider } from "../wallet/WalletProvider";
import { PolicyForm } from "./PolicyForm";

const owner = "0x1111111111111111111111111111111111111111";
let providerRequest: Eip1193Provider["request"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  providerRequest = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_requestAccounts") return [owner];
    if (method === "eth_chainId") return "0xc4";
    if (method === "personal_sign") return `0x${"ab".repeat(65)}`;
    throw new Error(`Unexpected wallet method ${method}`);
  });
});

function renderForm(): void {
  render(<WalletProvider><WalletButton /><PolicyForm /></WalletProvider>);
  const detail: Eip6963ProviderDetail = {
    info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
    provider: { request: providerRequest },
  };
  act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
}

async function fillRequiredFields(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
  fireEvent.click(screen.getByLabelText(/snapshot-derived exact allocation/i));
}

describe("PolicyForm", () => {
  it("derives the owner from a wallet and lets the user choose an executable asset", () => {
    renderForm();

    expect(screen.queryByLabelText("Wallet address")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Asset" })).toHaveDisplayValue("USDG");
    expect(screen.getByRole("option", { name: "USDt0" })).toBeVisible();
    expect(screen.queryByLabelText("Protocol exposure")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Minimum Aave reserve TVL")).not.toBeInTheDocument();
  });

  it("keeps verifier controls behind advanced settings", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(screen.getByLabelText("Protocol exposure")).toHaveValue("100");
    expect(screen.getByLabelText("Minimum Aave reserve TVL")).toHaveValue("500000");
    expect(screen.getByLabelText("Minimum estimated pre-gas APY")).toHaveValue("0.05");
  });

  it("keeps submission gated until the wallet and risk acknowledgement are present", async () => {
    renderForm();
    const submit = screen.getByRole("button", { name: "Open solver market" });

    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/snapshot-derived exact allocation/i));
    expect(submit).toBeEnabled();
  });

  it("shows the exact principal and policy boundary before submission", async () => {
    renderForm();
    await fillRequiredFields();

    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("10");
    expect(screen.getByText("10.00 USDG")).toBeVisible();
    expect(screen.getByText("10.00 USDG exact")).toBeVisible();
    expect(screen.getByText("No bridges")).toBeVisible();
    expect(screen.getByText("Outputs: USDG and USDt0")).toBeVisible();
    expect(screen.getByText("Adapters: Aave V3 supply and Uniswap V3 swap")).toBeVisible();
    expect(screen.getByText("Maximum swap slippage: 0.50%")).toBeVisible();
    expect(screen.getByText("Yield horizon: 30 days")).toBeVisible();
    expect(screen.getByText("Maximum snapshot age: 300 seconds")).toBeVisible();
    expect(screen.getByText("Intent lifetime: 30 minutes")).toBeVisible();
    expect(screen.getByText("Principal stays in your wallet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open solver market" })).toBeEnabled();
  });

  it("describes adapter possibilities without promising a multi-protocol route", () => {
    renderForm();

    expect(screen.getByText("10.00 USDG exact")).toBeVisible();
    expect(screen.getByText(/may evaluate Aave V3 supply and Uniswap V3 swap opportunities/i))
      .toBeVisible();
    expect(screen.getByText(/principal remains unmoved/i)).toBeVisible();
    expect(screen.getByText(/purchased route remains a non-executing plan/i)).toBeVisible();
    expect(screen.getByText("Free request · Pay only after selecting an authorized quote"))
      .toBeVisible();
    expect(screen.queryByText(/paid reveal is not wired/i)).not.toBeInTheDocument();
  });

  it("surfaces an API error without inventing a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ code: "OKX_UNAVAILABLE", message: "Live data unavailable" }, { status: 503 }),
      ),
    );
    renderForm();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open solver market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Live data unavailable");
    expect(screen.queryByText(/request .* opened/i)).not.toBeInTheDocument();
  });

  it("reports a completed request with no authorized route without claiming one is ready", async () => {
    const requestId = "550e8400-e29b-41d4-a716-446655440000";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      requestId,
      policyHash: `0x${"ab".repeat(32)}`,
      quoteCount: 0,
      failureCount: 1,
    })));
    renderForm();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open solver market" }));

    expect(await screen.findByRole("heading", {
      name: "Request completed without an authorized route",
    })).toBeVisible();
    expect(screen.getByText("1 solver attempt failed or was rejected.")).toBeVisible();
    expect(screen.queryByText(/route quote is ready/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review request" }))
      .toHaveAttribute("href", `/requests/${requestId}`);
  });

  it("reports rejected solver attempts alongside an authorized quote", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      policyHash: `0x${"ab".repeat(32)}`,
      quoteCount: 1,
      failureCount: 1,
    })));
    renderForm();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open solver market" }));

    expect(await screen.findByText("1 route-authorized quote is ready.")).toBeVisible();
    expect(screen.getByText("1 solver attempt failed or was rejected.")).toBeVisible();
  });

  it("signs a canonical V2 exact-allocation route policy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        policyHash: `0x${"ab".repeat(32)}`,
        quoteCount: 1,
        failureCount: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open solver market" }));

    expect(await screen.findByText("Solver market complete")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      ownerSignature: `0x${"ab".repeat(65)}`,
      policy: {
        version: 2,
        owner,
        principalAtomic: "10000000",
        protocolExposureBps: 10_000,
        minPreGasApyBps: 5,
        noBridges: true,
        allowedOutputAssets: [
          "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
          "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        ],
        allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
        maxSlippageBps: 50,
        horizonDays: 30,
      },
    });
    expect(body.policy).not.toHaveProperty("maxProtocolExposureBps");
    expect(providerRequest).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [commitment(body.policy), owner],
    });
  });
});
