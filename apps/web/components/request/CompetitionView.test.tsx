// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { Challenge } from "@okxweb3/mpp";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import type { Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { quoteSelectionCommitment } from "../../lib/intents/commitments";
import { RevealProofSchema, revealProofCommitment } from "../../lib/payments/reveal-proof";
import { buildPaymentTerms, paymentTermsToChargeOptions } from "../../lib/payments/terms";
import { WalletButton } from "../wallet/WalletButton";
import { WalletProvider } from "../wallet/WalletProvider";
import { CompetitionView } from "./CompetitionView";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId: `0x${string}` = `0x${"ab".repeat(32)}`;
const owner = "0x1111111111111111111111111111111111111111";
const paymentAsset = "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c";
const treasury = "0x3333333333333333333333333333333333333333";
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
  paymentRecovery: "none",
  freshness: { observedAtSec: 1_999_999_700, nextExpirySec: 2_000_000_000 },
  quotes: [{
    version: 1,
    quoteId,
    requestId,
    solverId: "determinist",
    solverAddress: owner,
    bundleHash: quoteId,
    expectedNetApyBps: 256,
    riskGrade: "unassessed",
    priceAtomic: "100000",
    validUntil: 2_000_000_000,
    verification: { executable: true, errorCodes: [], score: 256 },
  }],
};

const paymentTerms = buildPaymentTerms({
  quote: market.quotes[0],
  solver: owner,
  treasury,
  realm: "pay.cobia.example",
  issuedAt: 1_999_999_700,
  cutoff: 2_000_000_000,
});

const domainAbi = [{
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompetitionView", () => {
  it("labels an evidence-free deterministic quote as unassessed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market)));

    render(<CompetitionView requestId={requestId} />);

    expect(await screen.findByText("Unassessed")).toBeVisible();
  });

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

  it("identifies the Cobia-operated quote signer and complete reveal split", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(market)));

    render(<CompetitionView requestId={requestId} />);

    expect(await screen.findByText("Operated by Cobia")).toBeVisible();
    expect(screen.getByText("0.09 to quote signer")).toBeVisible();
    expect(screen.getByText("0.01 to Cobia")).toBeVisible();
  });

  it("signs one owner proof and replays its exact body with an EIP-3009 credential", async () => {
    const ownerSignature = `0x${"cd".repeat(65)}`;
    const paymentSignature = `0x${"ef".repeat(65)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [owner];
      if (method === "eth_chainId") return "0xc4";
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "personal_sign") return ownerSignature;
      if (method === "eth_signTypedData_v4") return paymentSignature;
      throw new Error(`Unexpected wallet method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
      provider: { request },
    };
    const selectedMarket = {
      ...market,
      state: "payment_pending",
      selectedQuoteId: quoteId,
      paymentRecovery: "resume",
      paymentTerms,
    };
    const options = paymentTermsToChargeOptions(paymentTerms);
    const challenge = Challenge.from({
      id: "challenge-1",
      realm: paymentTerms.realm,
      method: "evm",
      intent: "charge",
      description: options.description,
      expires: options.expires,
      request: {
        amount: options.amount,
        currency: options.currency,
        recipient: options.recipient,
        externalId: options.externalId,
        methodDetails: options.methodDetails,
      },
    });
    const route = {
      id: quoteId,
      requestId,
      quoteId,
      buyer: owner,
      executionChainId: 196,
      paymentChainId: 1952,
      receiptHash: `0x${"12".repeat(32)}`,
      purchasedAt: "2033-05-18T03:32:00.000Z",
      policy: market.policy,
      bundle: {
        version: 1,
        requestId,
        solverId: "determinist",
        solverAddress: owner,
        policyHash: `0x${"13".repeat(32)}`,
        snapshotHash: `0x${"14".repeat(32)}`,
        allocations: [{ candidateId: "cash:usdt", bps: 10_000 }],
        evidence: [],
        riskFlags: [],
        expectedNetApyBps: 0,
        action: { kind: "hold", amountAtomic: "0" },
        validUntil: 2_000_000_000,
        signature: `0x${"15".repeat(65)}`,
      },
    };
    let marketReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://testrpc.xlayer.tech/terigon") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: encodeFunctionResult({
          abi: domainAbi,
          functionName: "eip712Domain",
          result: ["0x0f", "USD₮0", "1", 1952n, paymentAsset, `0x${"00".repeat(32)}`, []],
        }) });
      }
      if (!init?.method) {
        marketReads += 1;
        return Response.json(marketReads === 1
          ? selectedMarket
          : { ...selectedMarket, state: "revealed", purchasedRouteId: quoteId });
      }
      const headers = new Headers(init.headers);
      if (!headers.has("authorization")) {
        return new Response(null, {
          status: 402,
          headers: { "WWW-Authenticate": Challenge.serialize(challenge) },
        });
      }
      return Response.json({ routeId: quoteId, route });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><WalletButton /><CompetitionView requestId={requestId} /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ });
    fireEvent.click(await screen.findByRole("button", { name: "Resume payment" }));

    expect(await screen.findByText("Your purchased quote")).toBeVisible();
    const revealPosts = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith(`/quotes/${quoteId}/reveal`) && init?.method === "POST");
    expect(revealPosts).toHaveLength(2);
    const firstBody = JSON.parse(String(revealPosts[0]?.[1]?.body));
    const secondBody = JSON.parse(String(revealPosts[1]?.[1]?.body));
    expect(secondBody).toEqual(firstBody);
    const proof = RevealProofSchema.parse(firstBody.proof);
    expect(proof).toMatchObject({
      requestId,
      quoteId,
      owner,
      paymentChainId: 1952,
      executionChainId: 196,
    });
    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [revealProofCommitment(proof), owner],
    });
    expect(new Headers(revealPosts[1]?.[1]?.headers).get("authorization"))
      .toMatch(/^Payment /);
  });

  it.each([
    [owner, { ...market, state: "selected", selectedQuoteId: quoteId }, "Payment terms are unavailable"],
    ["0x4444444444444444444444444444444444444444", {
      ...market, state: "selected", selectedQuoteId: quoteId, paymentTerms,
    }, "Connect request owner"],
  ])("blocks reveal without exact owner and terms before signing", async (account, selected, message) => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return "0xc4";
      throw new Error(`Unexpected wallet method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
      provider: { request },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(selected));
    vi.stubGlobal("fetch", fetchMock);
    render(<WalletProvider><WalletButton /><CompetitionView requestId={requestId} /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /Phantom ·/ });
    fireEvent.click(await screen.findByRole("button", { name: "Pay & reveal bundle" }));

    expect(await screen.findByText(new RegExp(message))).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "personal_sign" }));
  });
});
