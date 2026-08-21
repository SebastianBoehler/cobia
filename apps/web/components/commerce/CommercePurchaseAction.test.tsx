// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommercePurchaseAction } from "./CommercePurchaseAction";

const owner = "0x1111111111111111111111111111111111111111";
const offerCommitment = `0x${"33".repeat(32)}`;
const wallet = vi.hoisted(() => ({
  request: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({ account: owner, request: wallet.request, switchChain: wallet.switchChain }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  wallet.request.mockReset().mockResolvedValue(`0x${"ab".repeat(65)}`);
  wallet.switchChain.mockReset().mockResolvedValue(undefined);
});

describe("CommercePurchaseAction", () => {
  it("blocks every signature and placement when the exact payment balance is insufficient", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({
      code: "INSUFFICIENT_PAYMENT_BALANCE",
      message: "Insufficient payment-token balance on Base: 0 atomic available, 5000 required.",
    }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);

    render(<CommercePurchaseAction offerCommitment={offerCommitment} />);
    fireEvent.click(screen.getByRole("button", { name: "Review and buy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Insufficient payment-token balance on Base",
    );
    expect(wallet.request).not.toHaveBeenCalled();
    expect(wallet.switchChain).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetcher).not.toHaveBeenCalledWith(
      "/api/commerce/placements",
      expect.anything(),
    ));
  });
});
