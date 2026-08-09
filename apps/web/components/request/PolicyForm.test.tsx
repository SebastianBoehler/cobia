// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PolicyForm } from "./PolicyForm";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillRequiredFields(): void {
  fireEvent.change(screen.getByLabelText("Wallet address"), {
    target: { value: "0x1111111111111111111111111111111111111111" },
  });
  fireEvent.click(screen.getByLabelText(/machine-generated research/i));
}

describe("PolicyForm", () => {
  it("keeps submission gated until the address and risk acknowledgement are valid", () => {
    render(<PolicyForm />);
    const submit = screen.getByRole("button", { name: "Open quote market" });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Wallet address"), {
      target: { value: "not-an-address" },
    });
    fireEvent.click(screen.getByLabelText(/machine-generated research/i));
    expect(screen.getByText("Enter a valid EVM address.")).toBeVisible();
    expect(submit).toBeDisabled();
  });

  it("shows the exact principal and policy boundary before submission", () => {
    render(<PolicyForm />);
    fillRequiredFields();

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
    render(<PolicyForm />);
    fillRequiredFields();

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
    render(<PolicyForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Open quote market" }));

    expect(await screen.findByText("Quote market opened")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      owner: "0x1111111111111111111111111111111111111111",
      principalAtomic: "25000000000",
      maxProtocolExposureBps: 4_000,
      noBridges: true,
    });
  });
});
