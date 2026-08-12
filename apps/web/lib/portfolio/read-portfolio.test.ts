import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBalance = vi.fn(async () => 0n);
const getBlockNumber = vi.fn(async () => 123n);
const readContract = vi.fn<(request: { address: string }) => Promise<bigint>>();

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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("mainnet portfolio", () => {
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
