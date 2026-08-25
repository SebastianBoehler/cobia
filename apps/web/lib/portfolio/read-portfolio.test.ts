import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

interface RecentPnlItem {
  token: Address;
  symbol: string;
  lastActiveAt: string;
  totalPnlUsd: string;
  totalPnlPercent: string;
  realizedPnlUsd: string;
  unrealizedPnlUsd: string;
  balanceUsd: string;
}

interface DexHistoryItem {
  type: "buy" | "sell";
  token: Address;
  symbol: string;
  valueUsd: string;
  amount: string;
  priceUsd: string;
  pnlUsd: string;
  occurredAt: string;
}

const getBalance = vi.fn(async () => 0n);
const getBlockNumber = vi.fn(async () => 123n);
const readContract = vi.fn<(request: { address: string; functionName?: string }) => Promise<bigint | number | string>>();
const listXLayerTokenBalances = vi.fn<(address: string) => Promise<Array<{
  chainId: 196; token: `0x${string}`; symbol: string; balance: string; priceUsd: string;
}>>>(async () => []);
const getXLayerTotalValue = vi.fn(async () => ({
  totalValueUsd: "0", fetchedAt: "2026-08-25T10:00:00.000Z",
}));
const getXLayerRecentPnl = vi.fn<() => Promise<RecentPnlItem[]>>(async () => []);
const getXLayerDexHistory = vi.fn<() => Promise<{
  beginAt: string;
  endAt: string;
  transactions: DexHistoryItem[];
}>>(async () => ({
  beginAt: "2026-07-26T10:00:00.000Z",
  endAt: "2026-08-25T10:00:00.000Z",
  transactions: [],
}));

vi.mock("../okx/client", () => ({
  createOkxClient: vi.fn(() => ({ listXLayerTokenBalances })),
}));
vi.mock("../okx/portfolio-analytics", () => ({
  createOkxPortfolioAnalyticsClient: vi.fn(() => ({
    getXLayerTotalValue,
    getXLayerRecentPnl,
    getXLayerDexHistory,
  })),
}));
vi.mock("../env", () => ({ readOkxCredentials: vi.fn(() => ({})) }));

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: vi.fn(() => ({
    getBalance,
    getBlockNumber,
    readContract,
  })),
  http: vi.fn(() => undefined),
}));

import { readPortfolio } from "./read-portfolio";

const owner = "0x2222222222222222222222222222222222222222";
const usdt0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const aUsdt0 = "0xF356ae412dB5df43BD3a10746f7ad4e1C4De4297";

beforeEach(() => {
  getBalance.mockResolvedValue(0n);
  getBlockNumber.mockResolvedValue(123n);
  readContract.mockResolvedValue(0n);
  listXLayerTokenBalances.mockResolvedValue([]);
  getXLayerTotalValue.mockResolvedValue({
    totalValueUsd: "0", fetchedAt: "2026-08-25T10:00:00.000Z",
  });
  getXLayerRecentPnl.mockResolvedValue([]);
  getXLayerDexHistory.mockResolvedValue({
    beginAt: "2026-07-26T10:00:00.000Z",
    endAt: "2026-08-25T10:00:00.000Z",
    transactions: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("mainnet portfolio", () => {
  it("omits Aave positions with a zero on-chain balance", async () => {
    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");

    expect(snapshot.positions).toEqual([]);
  });

  it("adds independently sourced OKX value, PnL, and DEX activity", async () => {
    getXLayerTotalValue.mockResolvedValue({
      totalValueUsd: "1450.25", fetchedAt: "2026-08-25T10:00:00.000Z",
    });
    getXLayerRecentPnl.mockResolvedValue([{ token: usdt0.toLowerCase() as Address, symbol: "USDt0",
      lastActiveAt: "2026-08-25T09:50:00.000Z", totalPnlUsd: "18.25",
      totalPnlPercent: "2.30", realizedPnlUsd: "12.50", unrealizedPnlUsd: "5.75",
      balanceUsd: "1060.00" }]);
    getXLayerDexHistory.mockResolvedValue({
      beginAt: "2026-07-26T10:00:00.000Z",
      endAt: "2026-08-25T10:00:00.000Z",
      transactions: [{ type: "buy" as const, token: usdt0.toLowerCase() as Address, symbol: "USDt0",
        valueUsd: "250.00", amount: "250", priceUsd: "1.00", pnlUsd: "4.50",
        occurredAt: "2026-08-25T09:50:00.000Z" }],
    });

    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");

    expect(snapshot.analytics).toEqual({
      status: "available",
      source: "okx-indexed",
      totalValue: { status: "available", totalValueUsd: "1450.25",
        fetchedAt: "2026-08-25T10:00:00.000Z" },
      recentPnl: { status: "available", items: expect.arrayContaining([
        expect.objectContaining({ symbol: "USDt0", totalPnlUsd: "18.25" }),
      ]) },
      dexHistory: { status: "available", beginAt: "2026-07-26T10:00:00.000Z",
        endAt: "2026-08-25T10:00:00.000Z", items: expect.arrayContaining([
          expect.objectContaining({ type: "buy", symbol: "USDt0", valueUsd: "250.00" }),
        ]) },
    });
  });

  it("keeps independent analytics sources visible when one OKX read fails", async () => {
    getXLayerTotalValue.mockRejectedValueOnce(new Error("total value unavailable"));
    getXLayerRecentPnl.mockResolvedValueOnce([{ token: usdt0.toLowerCase() as Address, symbol: "USDt0",
      lastActiveAt: "2026-08-25T09:50:00.000Z", totalPnlUsd: "18.25",
      totalPnlPercent: "2.30", realizedPnlUsd: "12.50", unrealizedPnlUsd: "5.75",
      balanceUsd: "1060.00" }]);

    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");

    expect(snapshot.analytics.status).toBe("available");
    if (snapshot.analytics.status !== "available") throw new Error("Expected mainnet analytics");
    expect(snapshot.analytics.totalValue).toEqual({
      status: "unavailable",
      message: "Indexed portfolio value is temporarily unavailable.",
    });
    expect(snapshot.analytics.recentPnl).toMatchObject({
      status: "available",
      items: [expect.objectContaining({ symbol: "USDt0", totalPnlUsd: "18.25" })],
    });
    expect(snapshot.balances).toBeDefined();
  });

  it("adds each verified wallet ERC-20 discovered by the X Layer balance index", async () => {
    const token = "0x1111111111111111111111111111111111111111" as const;
    listXLayerTokenBalances.mockResolvedValue([{ chainId: 196, token, symbol: "EXAMPLE",
      balance: "2", priceUsd: "1.25" }]);
    readContract.mockImplementation(async ({ address: queried, functionName }) => {
      if (queried === token && functionName === "balanceOf") return 2_000_000_000_000_000_000n;
      if (queried === token && functionName === "decimals") return 18;
      if (queried === token && functionName === "symbol") return "EXAMPLE";
      return 0n;
    });

    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");

    expect(snapshot.balances).toContainEqual({ address: token, symbol: "EXAMPLE", decimals: 18,
      amountAtomic: "2000000000000000000", formatted: "2", priceUsd: "1.25" });
  });

  it("maps the canonical USDt0 Aave balance to its portfolio position", async () => {
    readContract.mockImplementation(async ({ address }) => {
      if (address === usdt0) return 20_000_001n;
      if (address === aUsdt0) return 30_000_002n;
      if (address === "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8") return 11n;
      if (address === "0x228765a3C18065C923F23a0CCb6c7cEFB3eA2223") return 33n;
      throw new Error(`Unexpected contract ${address}`);
    });

    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");

    expect(snapshot.balances.find(({ address }) => address === usdt0)).toMatchObject({
      symbol: "USDt0",
      amountAtomic: "20000001",
    });
    expect(snapshot.positions.find(({ symbol }) => symbol === "aUSDt0")).toEqual({
      adapterId: "aave-v3@1",
      symbol: "aUSDt0",
      amountAtomic: "30000002",
      formatted: "30.000002",
    });
  });

  it("preserves the exact atomic USDt0 total across wallet and Aave balances", async () => {
    readContract.mockImplementation(async ({ address }) => {
      if (address === usdt0) return 9_007_199_254_740_993n;
      if (address === aUsdt0) return 9_007_199_254_740_995n;
      return 0n;
    });

    const snapshot = await readPortfolio(owner, 196, "https://rpc.invalid");
    const cash = snapshot.balances.find(({ address }) => address === usdt0);
    const supplied = snapshot.positions.find(({ symbol }) => symbol === "aUSDt0");

    expect(BigInt(cash?.amountAtomic ?? 0) + BigInt(supplied?.amountAtomic ?? 0)).toBe(
      18_014_398_509_481_988n,
    );
  });

  it("propagates an Aave balance RPC failure", async () => {
    const rpcFailure = new Error("X Layer RPC unavailable");
    readContract.mockImplementation(async ({ address }) => {
      if (address === aUsdt0) throw rpcFailure;
      return 0n;
    });

    await expect(readPortfolio(owner, 196, "https://rpc.invalid")).rejects.toBe(rpcFailure);
  });
});

describe("testnet portfolio", () => {
  it("reads only native testnet OKB without inventing protocol assets", async () => {
    getBalance.mockResolvedValue(42n);

    const snapshot = await readPortfolio(owner, 1952, "https://testnet-rpc.invalid");

    expect(snapshot).toMatchObject({
      chainId: 1952,
      networkName: "X Layer Testnet",
      native: { symbol: "OKB", amountAtomic: "42" },
      balances: [],
      positions: [],
    });
    expect(readContract).not.toHaveBeenCalled();
  });
});
