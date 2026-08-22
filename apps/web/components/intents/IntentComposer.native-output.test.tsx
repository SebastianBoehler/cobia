// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NATIVE_INTENT_ASSET } from "../../lib/intents/capability-templates";
import { IntentComposer } from "./IntentComposer";

const owner = "0x1111111111111111111111111111111111111111";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({
    account: owner, chainId: 196, targetChainId: 196,
    request: vi.fn(), switchChain: vi.fn(), switchToXLayer: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("IntentComposer native conversion output", () => {
  it("checks gas readiness for an 18-decimal OKB outcome", async () => {
    const values = {
      kind: "staged-conversion" as const, templateId: "staged-conversion" as const,
      inputs: [{
        kind: "erc20" as const, chainId: 196 as const,
        token: "0x228765a3c18065c923f23a0ccb6c7cefb3ea2223" as const,
        symbol: "aXlrUSDG", decimals: 18, amount: "0.999999",
      }],
      outputToken: NATIVE_INTENT_ASSET.address,
      outputSymbol: "OKB", outputDecimals: 18,
      minimum: "0.008948851721045591", minimumSource: "market-default" as const,
      maxSolverFeeUsd: "0",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/intents/compile") {
        return Promise.resolve(Response.json({ status: "review", values }));
      }
      if (url === "/api/intents/readiness") {
        return Promise.resolve(Response.json({ missingNativeBalanceChainIds: [] }));
      }
      return Promise.resolve(Response.json({ assets: [], unresolved: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntentComposer />);
    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "sell @aXlrUSDG into @OKB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(await screen.findByRole("heading", { name: "Review the staged conversion" })).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/intents/readiness", expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.getByRole("button", { name: "Sign and publish intent" })).toBeEnabled();
  });
});
