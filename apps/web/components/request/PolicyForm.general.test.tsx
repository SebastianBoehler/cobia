// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { commitment } from "@cobia/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../../lib/adapters/registry";
import type { Eip1193Provider, Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { WalletButton } from "../wallet/WalletButton";
import { WalletProvider } from "../wallet/WalletProvider";
import { PolicyForm } from "./PolicyForm";

const owner = "0x1111111111111111111111111111111111111111";
let providerRequest: Eip1193Provider["request"];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  providerRequest = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_requestAccounts") return [owner];
    if (method === "eth_chainId") return "0xc4";
    if (method === "personal_sign") return `0x${"ab".repeat(65)}`;
    throw new Error(`Unexpected wallet method ${method}`);
  });
});

async function renderConnectedForm() {
  render(<WalletProvider><WalletButton /><PolicyForm /></WalletProvider>);
  const detail: Eip6963ProviderDetail = {
    info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
    provider: { request: providerRequest },
  };
  act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
}

function success() {
  return Response.json({
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    policyHash: `0x${"ab".repeat(32)}`,
    agentProgramId: "550e8400-e29b-41d4-a716-446655440099",
  });
}

describe("PolicyForm general on-chain policies", () => {
  it("signs a canonical policy with an enforceable Aave receipt outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);
    await renderConnectedForm();

    fireEvent.click(screen.getByRole("button", { name: "Build verified program" }));

    expect(await screen.findByText("Coding-agent program verified")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      ownerSignature: `0x${"ab".repeat(65)}`,
      policy: {
        version: 1, kind: "general-onchain", owner, executionChainId: 196,
        manifestHash: registryHash,
        input: { token: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", maxAtomic: "10000000" },
        allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
        balanceConstraints: [{
          kind: "minimumIncrease",
          token: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address.toLowerCase(),
          atomic: "9950000",
        }],
        objective: { kind: "satisfy" }, predicates: [], forbiddenTargets: [], forbiddenAssets: [],
      },
    });
    expect(body.policy).not.toHaveProperty("allowedAdapters");
    expect(fetchMock).toHaveBeenCalledWith("/api/general-intents", expect.objectContaining({ method: "POST" }));
    expect(providerRequest).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
  });

  it.each([
    ["Swap", { token: "0x779ded0c9e1022225f8e0630b35a9b54be713736", atomic: "9950000", maxActions: 1 }],
    ["Profit", { token: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", atomic: "10000", maxActions: 2 }],
  ] as const)("signs and submits an atomic %s objective", async (mode, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", fetchMock);
    await renderConnectedForm();
    fireEvent.click(screen.getByRole("tab", { name: mode }));

    fireEvent.click(screen.getByRole("button", { name: "Build verified program" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.policy).toMatchObject({
      kind: "general-onchain", limits: { maxActions: expected.maxActions },
      balanceConstraints: [{ kind: "minimumIncrease", token: expected.token, atomic: expected.atomic }],
      allowedCapabilities: [
        { id: "curve-stableswap-ng.exact-input", version: 1 },
        { id: "uniswap-v3.exact-input", version: 1 },
      ],
    });
    expect(providerRequest).toHaveBeenCalledWith({
      method: "personal_sign", params: [commitment(body.policy), owner],
    });
  });
});
