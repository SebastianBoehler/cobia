// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { Challenge, Credential } from "@okxweb3/mpp";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import type { Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { quoteSelectionCommitment } from "../../lib/intents/commitments";
import { WalletButton } from "../wallet/WalletButton";
import { WalletProvider } from "../wallet/WalletProvider";
import { CompetitionView } from "./CompetitionView";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}`;
const owner = "0x1111111111111111111111111111111111111111";
const paymentAsset = "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c";
const treasury = "0x3333333333333333333333333333333333333333";
const eip5267Abi = [{
  type: "function",
  name: "eip712Domain",
  stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "fields", type: "bytes1" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
    { name: "extensions", type: "uint256[]" },
  ],
}] as const;
const market = {
  requestId,
  state: "quotes_ready",
  policy: {
    version: 1,
    requestId,
    owner,
    executionChainId: 196,
    asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 200,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
  },
  snapshot: null,
  selectedQuoteId: null,
  purchasedRouteId: null,
  quotes: [{
    version: 1,
    quoteId,
    requestId,
    solverId: "determinist",
    solverAddress: owner,
    bundleHash: quoteId,
    expectedNetApyBps: 256,
    riskGrade: "low",
    priceAtomic: "100000",
    validUntil: 2_000_000_000,
    verification: { executable: true, errorCodes: [], score: 256 },
  }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompetitionView", () => {
  it("requires the owner wallet signature before selecting a quote", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [owner];
      if (method === "eth_chainId") return "0xc4";
      if (method === "personal_sign") return `0x${"cd".repeat(65)}`;
      throw new Error(`Unexpected wallet method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
      provider: { request },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(market))
      .mockResolvedValueOnce(Response.json({ state: "selected" }))
      .mockResolvedValueOnce(Response.json({ ...market, state: "selected", selectedQuoteId: quoteId }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><WalletButton /><CompetitionView requestId={requestId} /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
    fireEvent.click(await screen.findByRole("button", { name: "Select quote" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [quoteSelectionCommitment(requestId, quoteId), owner],
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      quoteId,
      ownerSignature: `0x${"cd".repeat(65)}`,
    });
  });

  it("identifies Cobia-operated solvers and the complete reveal split", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market)));

    render(<CompetitionView requestId={requestId} />);

    expect(await screen.findByText("Operated by Cobia")).toBeVisible();
    expect(screen.getByText("0.09 to solver")).toBeVisible();
    expect(screen.getByText("0.01 to Cobia")).toBeVisible();
  });

  it("signs an EIP-3009 payment and automatically replays the reveal", async () => {
    const signature = `0x${"ef".repeat(65)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [owner];
      if (method === "eth_chainId") return "0xc4";
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_call") {
        return encodeFunctionResult({
          abi: eip5267Abi,
          functionName: "eip712Domain",
          result: ["0x0f", "USD₮0", "1", 1952n, paymentAsset, `0x${"00".repeat(32)}`, []],
        });
      }
      if (method === "eth_signTypedData_v4") return signature;
      throw new Error(`Unexpected wallet method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
      provider: { request },
    };
    const selectedMarket = { ...market, state: "selected", selectedQuoteId: quoteId };
    const challenge = Challenge.serialize({
      id: "challenge-1",
      realm: "localhost:3000",
      method: "evm",
      intent: "charge",
      request: {
        amount: "100000",
        currency: paymentAsset,
        recipient: owner,
        methodDetails: {
          chainId: 1952,
          feePayer: true,
          splits: [{ amount: "10000", recipient: treasury, memo: "cobia-platform" }],
        },
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(selectedMarket))
      .mockResolvedValueOnce(new Response(null, { status: 402, headers: { "WWW-Authenticate": challenge } }))
      .mockResolvedValueOnce(Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: encodeFunctionResult({
          abi: eip5267Abi,
          functionName: "eip712Domain",
          result: ["0x0f", "USD₮0", "1", 1952n, paymentAsset, `0x${"00".repeat(32)}`, []],
        }),
      }))
      .mockResolvedValueOnce(Response.json({
        routeId: quoteId,
        route: {
          id: quoteId,
          requestId,
          quoteId,
          buyer: owner,
          chainId: 196,
          receiptHash: `0x${"44".repeat(32)}`,
          purchasedAt: "2026-08-10T19:00:00.000Z",
          policy: market.policy,
          bundle: {
            version: 1,
            requestId,
            solverId: "determinist",
            solverAddress: owner,
            policyHash: `0x${"11".repeat(32)}`,
            snapshotHash: `0x${"22".repeat(32)}`,
            allocations: [{ candidateId: "cash:usdg", bps: 10_000 }],
            evidence: [],
            riskFlags: [],
            expectedNetApyBps: 0,
            action: { kind: "hold", amountAtomic: "25000000000" },
            validUntil: 2_000_000_000,
            signature: `0x${"33".repeat(65)}`,
          },
        },
      }))
      .mockResolvedValueOnce(Response.json({ ...selectedMarket, state: "revealed", purchasedRouteId: quoteId }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><WalletButton /><CompetitionView requestId={requestId} /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
    fireEvent.click(await screen.findByRole("button", { name: "Pay winner & reveal" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_signTypedData_v4" })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[3][1]?.headers).toEqual(expect.objectContaining({
      Authorization: expect.stringMatching(/^Payment /),
    }));
    const authorization = String((fetchMock.mock.calls[3][1]?.headers as Record<string, string>).Authorization);
    const credential = Credential.deserialize<{
      type: "transaction";
      authorization: { value: string; splits: Array<{ value: string; to: string }> };
    }>(authorization);
    expect(credential.payload.authorization.value).toBe("90000");
    expect(credential.payload.authorization.splits).toEqual([
      expect.objectContaining({ value: "10000", to: treasury }),
    ]);
    expect(await screen.findByRole("link", { name: "View purchased route" })).toHaveAttribute(
      "href",
      `/routes/${quoteId}`,
    );
    expect(screen.getByRole("heading", { name: "Your purchased route" })).toBeVisible();
  });
});
