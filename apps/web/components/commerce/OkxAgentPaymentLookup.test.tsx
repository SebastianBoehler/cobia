// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OkxAgentPaymentLookup } from "./OkxAgentPaymentLookup";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OkxAgentPaymentLookup", () => {
  it("shows bounded payment evidence without claiming order fulfillment", async () => {
    const transactionHash = `0x${"ab".repeat(32)}`;
    const fetcher = vi.fn().mockResolvedValue(Response.json({ payment: {
      provider: { id: "okx-agent-payments", displayName: "OKX Agent Payments" },
      paymentId: "a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB",
      status: "completed",
      realm: "provider.example.com",
      createdAt: "2026-04-21T10:00:00Z",
      expiresAt: "2026-04-21T10:30:00Z",
      payment: {
        chainId: 196,
        atomicAmount: "100000",
        asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        recipient: "0x1111111111111111111111111111111111111111",
        authorizationType: "eip-3009",
      },
      settlement: {
        transactionHash,
        blockNumber: 12_345_678,
        blockTimestamp: "2026-04-21T10:05:15Z",
        feeAtomicAmount: "300",
        feeBps: 30,
      },
      failureReason: null,
    } }));
    vi.stubGlobal("fetch", fetcher);
    render(<OkxAgentPaymentLookup />);

    expect(screen.getByText("Read only")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payment ID or link"), {
      target: { value: "a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect payment" }));

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OKX Agent Payments" })).toBeInTheDocument();
    expect(screen.getByText("100000 atomic")).toBeInTheDocument();
    expect(screen.getByText("X Layer · chain 196")).toBeInTheDocument();
    expect(screen.getByText("Payment settlement is not proof of order fulfillment.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View settlement on X Layer" }))
      .toHaveAttribute("href", `https://web3.okx.com/explorer/xlayer/tx/${transactionHash}`);
    expect(fetcher).toHaveBeenCalledWith("/api/commerce/okx-agent-payments", expect.objectContaining({
      method: "POST",
    }));
  });
});
