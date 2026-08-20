// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { commitment } from "@cobia/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentComposer } from "./IntentComposer";
import { DEFAULT_INTENT_RECEIPT_VALUES, INTENT_ASSETS } from "../../lib/intents/capability-templates";

const owner = "0x1111111111111111111111111111111111111111";
const state = vi.hoisted(() => ({
  push: vi.fn(), request: vi.fn(), switchChain: vi.fn(), switchToXLayer: vi.fn(),
  account: "0x1111111111111111111111111111111111111111" as `0x${string}` | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({
    account: state.account, chainId: 196, targetChainId: 196,
    request: state.request, switchChain: state.switchChain, switchToXLayer: state.switchToXLayer,
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  state.account = owner;
  state.push.mockReset();
  state.request.mockReset().mockResolvedValue(`0x${"ab".repeat(65)}`);
  state.switchChain.mockReset().mockResolvedValue(undefined);
  state.switchToXLayer.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe("IntentComposer", () => {
  it("starts with only the human goal before revealing policy fields", () => {
    render(<IntentComposer />);

    expect(screen.getByLabelText("What should happen?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review policy" })).toBeDisabled();
    expect(screen.getByLabelText("Action type")).toHaveValue("any");
    expect(screen.getByText("Mention")).toBeVisible();
    expect(screen.getByText("Routes")).toBeVisible();
    expect(screen.queryByLabelText("Verified capability")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsigned draft")).not.toBeInTheDocument();
  });

  it("compiles the goal before showing editable signed bounds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "review",
      values: DEFAULT_INTENT_RECEIPT_VALUES })));
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Put 10 USDG into a bounded Aave position." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)).toMatchObject({
      actionPreference: "any",
    });

    expect(await screen.findByRole("heading", { name: "Review the policy" })).toBeVisible();
    expect(screen.getByLabelText("Verified capability")).toHaveValue("aave-supply");
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeVisible();
  });

  it("starts from a challenge draft but creates fresh wallet-bound authority", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      links: { intent: "/intents/550e8400-e29b-41d4-a716-446655440001" },
    }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer initialDraft={{
      goal: "Exchange 10 USDG for at least 9.95 USDt0.",
      values: {
        jurisdiction: "DE", eligibilityAccepted: false,
        templateId: "exact-input-swap",
        inputToken: INTENT_ASSETS[0].address,
        outputToken: INTENT_ASSETS[1].address,
        amount: "10",
        minimum: "9.95",
        maxSolverFeeUsd: "0.10",
      },
    }} />);

    expect(screen.getByText("Exchange 10 USDG for at least 9.95 USDt0.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.policy).toMatchObject({
      requestId: "550e8400-e29b-41d4-a716-446655440001",
      owner,
      displayGoal: "Exchange 10 USDG for at least 9.95 USDt0.",
    });
    expect(body.policy).not.toHaveProperty("challengeId");
    expect(body).toEqual({ policy: expect.any(Object), ownerSignature: expect.any(String) });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("signs the rendered open policy commitment and publishes to the canonical API", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/intents/compile"
      ? Promise.resolve(Response.json({ status: "review", values: DEFAULT_INTENT_RECEIPT_VALUES }))
      : Promise.resolve(Response.json({
        intentId: "550e8400-e29b-41d4-a716-446655440000",
        policyHash: `0x${"cd".repeat(32)}`, state: "collecting",
        links: { intent: "/intents/550e8400-e29b-41d4-a716-446655440000" },
      }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntentComposer />);

    fireEvent.change(screen.getByLabelText("What should happen?"), {
      target: { value: "Put 10 USDG into a bounded Aave position." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));
    await screen.findByRole("heading", { name: "Review the policy" });
    fireEvent.click(screen.getByRole("button", { name: "Sign and publish intent" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(fetchMock).toHaveBeenCalledWith("/api/intents", expect.objectContaining({ method: "POST" }));
    expect(state.request).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
    expect(body.policy).toMatchObject({
      version: 3,
      displayGoal: "Put 10 USDG into a bounded Aave position.",
      executionChainIds: [196],
      limits: { maxSolverFeeAtomic: "100000" },
    });
    expect(body.policy).not.toHaveProperty("allowedCapabilities");
    expect(state.push).toHaveBeenCalledWith("/intents/550e8400-e29b-41d4-a716-446655440000");
  });
});
