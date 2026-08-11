import { commitment } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openQuoteMarketMock } = vi.hoisted(() => ({
  openQuoteMarketMock: vi.fn(async () => ({ quotes: [], failures: [] })),
}));

vi.mock("@/lib/runtime/market", () => ({
  openQuoteMarket: openQuoteMarketMock,
}));
vi.mock("@/lib/intents/signature", async () => import("../../../lib/intents/signature"));

import { POST } from "./route";

const nowSec = 1_900_000_000;
const requestId = "550e8400-e29b-41d4-a716-446655440000";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const basePolicy = {
  version: 1,
  requestId,
  owner: account.address,
  executionChainId: 196,
  asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  noBridges: true,
} as const;
const basePolicyV2 = {
  version: 2,
  requestId,
  owner: account.address.toLowerCase(),
  executionChainId: 196,
  asset: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  principalAtomic: "25000000000",
  protocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minPreGasApyBps: 200,
  maxSnapshotAgeSec: 300,
  noBridges: true,
  allowedOutputAssets: [
    "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  ],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 50,
  horizonDays: 30,
} as const;

async function submit(deadline: number | string, maxSnapshotAgeSec = 300) {
  const policy = { ...basePolicy, maxSnapshotAgeSec, deadline };
  const ownerSignature = typeof deadline === "number"
    ? await account.signMessage({ message: { raw: commitment(policy) } })
    : `0x${"ab".repeat(65)}`;
  return POST(new Request("https://cobia.example/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy, ownerSignature }),
  }));
}

describe("request creation policy deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
    openQuoteMarketMock.mockClear();
  });

  it("rejects a deadline equal to the ingress time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);

    const response = await submit(nowSec);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "MARKET_UNAVAILABLE",
      message: "The route market is temporarily unavailable.",
      requestId,
    });
  });

  it("accepts a deadline one second beyond the ingress time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    const policy = { ...basePolicy, deadline: nowSec + 1 };

    const response = await submit(policy.deadline);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      requestId,
      policyHash: commitment(policy),
      quoteCount: 0,
      failureCount: 0,
    });
  });

  it("preserves the invalid-intent response for a malformed deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);

    const response = await submit(`${nowSec + 1}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_INTENT",
      message: "The yield intent is invalid.",
      requestId: "unparsed",
    });
  });

  it("rejects freshness windows longer than the executable settlement window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);

    const response = await submit(nowSec + 300, 301);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INTENT",
      requestId: "unparsed",
    });
  });

  it("parses and dispatches a signed V2 route policy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    const policy = { ...basePolicyV2, deadline: nowSec + 300 };
    const ownerSignature = await account.signMessage({
      message: { raw: commitment(policy) },
    });

    const response = await POST(new Request("https://cobia.example/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, ownerSignature }),
    }));

    expect(response.status).toBe(201);
    expect(openQuoteMarketMock).toHaveBeenCalledWith(policy);
    expect(await response.json()).toMatchObject({
      requestId,
      policyHash: commitment(policy),
    });
  });

  it("rejects a zero APY floor at the authoritative V2 ingress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    const policy = {
      ...basePolicyV2,
      minPreGasApyBps: 0,
      deadline: nowSec + 300,
    };
    const ownerSignature = await account.signMessage({
      message: { raw: commitment(policy) },
    });

    const response = await POST(new Request("https://cobia.example/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, ownerSignature }),
    }));

    expect(response.status).toBe(400);
    expect(openQuoteMarketMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: "INVALID_INTENT",
      requestId,
    });
  });

  it("applies the V2 deadline parser at ingress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    const policy = { ...basePolicyV2, deadline: nowSec };
    const ownerSignature = await account.signMessage({
      message: { raw: commitment(policy) },
    });

    const response = await POST(new Request("https://cobia.example/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, ownerSignature }),
    }));

    expect(response.status).toBe(503);
    expect(openQuoteMarketMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: "MARKET_UNAVAILABLE",
      message: "The route market is temporarily unavailable.",
      requestId,
    });
  });

  it("does not expose provider or database errors in the response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowSec * 1_000);
    const policy = { ...basePolicyV2, deadline: nowSec + 300 };
    const ownerSignature = await account.signMessage({
      message: { raw: commitment(policy) },
    });
    openQuoteMarketMock.mockRejectedValueOnce(
      new Error("RPC https://user:secret@provider.example failed"),
    );

    const response = await POST(new Request("https://cobia.example/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, ownerSignature }),
    }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      code: "MARKET_UNAVAILABLE",
      message: "The route market is temporarily unavailable.",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
