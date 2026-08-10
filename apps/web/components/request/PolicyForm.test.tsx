// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
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
  fireEvent.click(screen.getByLabelText(/machine-generated research/i));
}

describe("PolicyForm", () => {
  it("derives the owner from a wallet and lets the user choose an executable asset", () => {
    renderForm();

    expect(screen.queryByLabelText("Wallet address")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Asset" })).toHaveDisplayValue("USDG");
    expect(screen.getByRole("option", { name: "USDt0" })).toBeVisible();
    expect(screen.queryByLabelText("Protocol exposure")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Minimum protocol TVL")).not.toBeInTheDocument();
  });

  it("keeps verifier controls behind advanced settings", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));

    expect(screen.getByLabelText("Protocol exposure")).toHaveValue("40");
    expect(screen.getByLabelText("Minimum protocol TVL")).toHaveValue("500000");
    expect(screen.getByLabelText("Minimum net APY")).toHaveValue("0.05");
  });

  it("keeps submission gated until the wallet and risk acknowledgement are present", async () => {
    renderForm();
    const submit = screen.getByRole("button", { name: "Open quote market" });

    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/machine-generated research/i));
    expect(submit).toBeEnabled();
  });

  it("shows the exact principal and policy boundary before submission", async () => {
    renderForm();
    await fillRequiredFields();

    expect(screen.getByText("25,000.00 USDG")).toBeVisible();
    expect(screen.getByText("10,000.00 USDG max")).toBeVisible();
    expect(screen.getByText("No bridges")).toBeVisible();
    expect(screen.getByText("Principal stays in your wallet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open quote market" })).toBeEnabled();
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

    fireEvent.click(screen.getByRole("button", { name: "Open quote market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Live data unavailable");
    expect(screen.queryByText(/request .* opened/i)).not.toBeInTheDocument();
  });

  it("creates a request from integer atomic values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        policyHash: `0x${"ab".repeat(32)}`,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open quote market" }));

    expect(await screen.findByText("Quote market opened")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      ownerSignature: `0x${"ab".repeat(65)}`,
      policy: {
        owner,
        principalAtomic: "25000000000",
        maxProtocolExposureBps: 4_000,
        noBridges: true,
      },
    });
  });
});
