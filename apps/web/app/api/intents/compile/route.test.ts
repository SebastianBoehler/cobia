import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), beginCompilation: vi.fn(), completeCompilation: vi.fn(),
  failCompilation: vi.fn(), compile: vi.fn(), clientKey: vi.fn(() => "client-key"),
  supportsCapability: vi.fn(), compilerOptions: vi.fn(), readPortfolio: vi.fn(),
  readIntentAssetPrices: vi.fn(),
}));
vi.mock("../../../../lib/runtime/wallet-auth", () => ({
  getWalletAuthService: () => mocks,
  walletAuthClientKey: mocks.clientKey,
}));
vi.mock("../../../../lib/intents/intent-compiler", () => ({
  createOpenAiIntentCompiler: (options: unknown) => {
    mocks.compilerOptions(options);
    return { compile: mocks.compile };
  },
}));
vi.mock("../../../../lib/runtime/market", () => ({
  getSolverProfileRepository: () => ({ supportsCapability: mocks.supportsCapability }),
}));
vi.mock("../../../../lib/portfolio/read-portfolio", () => ({
  readPortfolio: mocks.readPortfolio,
}));
vi.mock("../../../../lib/intents/intent-asset-prices", () => ({
  readIntentAssetPrices: mocks.readIntentAssetPrices,
}));

import { POST } from "./route";

function request(cookie?: string, origin = "https://getcobia.com", goal = "Supply 10 USDG to Aave",
  actionPreference = "aave-supply") {
  return new Request("https://getcobia.com/api/intents/compile", {
    method: "POST",
    headers: { "content-type": "application/json", origin,
      ...(cookie ? { cookie: `cobia_wallet_session=${cookie}` } : {}) },
    body: JSON.stringify({ owner: "0x1111111111111111111111111111111111111111",
      goal, actionPreference }),
  });
}

describe("authenticated intent compiler API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.completeCompilation.mockResolvedValue(undefined);
    mocks.failCompilation.mockResolvedValue(undefined);
    mocks.readSession.mockResolvedValue({ owner: "0x1111111111111111111111111111111111111111" });
    mocks.beginCompilation.mockResolvedValue({ kind: "run", id: "550e8400-e29b-41d4-a716-446655440000" });
    mocks.compile.mockResolvedValue({ status: "review", values: {} });
    mocks.supportsCapability.mockResolvedValue(true);
    mocks.readPortfolio.mockResolvedValue({
      native: { symbol: "OKB", amountAtomic: "10000000000000000", formatted: "0.01" },
      balances: [
        { symbol: "USDG", amountAtomic: "1500000", formatted: "1.5" },
        { symbol: "USDt0", amountAtomic: "4250000", formatted: "4.25" },
      ],
    });
    mocks.readIntentAssetPrices.mockResolvedValue({ OKB: "107.41", USDt0: "1", USDG: "1" });
  });

  it("rejects missing sessions and cross-origin requests before invoking the model", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("token", "https://attacker.example"))).status).toBe(403);
    expect(mocks.compile).not.toHaveBeenCalled();
  });

  it("rejects a session created by a different wallet", async () => {
    mocks.readSession.mockResolvedValueOnce({ owner: "0x2222222222222222222222222222222222222222" });
    expect((await POST(request("token"))).status).toBe(401);
    expect(mocks.beginCompilation).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
  });

  it("does not prompt for another signature when session storage is unavailable", async () => {
    mocks.readSession.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request("token"));
    expect(response.status).toBe(503);
    expect(mocks.beginCompilation).not.toHaveBeenCalled();
  });

  it("returns a deduplicated result without invoking the model", async () => {
    mocks.beginCompilation.mockResolvedValue({ kind: "cached", result: { status: "clarification", question: "Amount?" } });
    const response = await POST(request("token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "clarification", question: "Amount?" });
    expect(mocks.compile).not.toHaveBeenCalled();
  });

  it("records successful and failed model work against the durable lease", async () => {
    expect((await POST(request("token"))).status).toBe(200);
    expect(mocks.supportsCapability).toHaveBeenCalledWith(
      "policy.capability-composition@1", expect.any(Number),
    );
    expect(mocks.compilerOptions).toHaveBeenCalledWith(expect.objectContaining({
      compositionAvailable: true,
    }));
    expect(mocks.completeCompilation).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000", { status: "review", values: {} },
    );

    mocks.compile.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await POST(request("token"))).status).toBe(503);
    expect(mocks.failCompilation).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });

  it("disables composed compiler output without a fresh compatible solver", async () => {
    mocks.supportsCapability.mockResolvedValue(false);

    expect((await POST(request("token"))).status).toBe(200);
    expect(mocks.compilerOptions).toHaveBeenCalledWith(expect.objectContaining({
      compositionAvailable: false,
    }));
  });

  it("supplies a fresh wallet snapshot when the goal spends all of one token", async () => {
    const response = await POST(request(
      "token", "https://getcobia.com", "Swap all my USDt0 into USDG", "any",
    ));

    expect(response.status).toBe(200);
    expect(mocks.readPortfolio).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111", 196,
    );
    expect(mocks.compilerOptions).toHaveBeenCalledWith(expect.objectContaining({
      walletBalances: { OKB: "0.01", USDG: "1.5", USDt0: "4.25" },
    }));
    expect(mocks.beginCompilation).toHaveBeenCalledWith(expect.objectContaining({
      goal: expect.stringContaining("OKB:10000000000000000"),
    }));
    expect(mocks.beginCompilation).toHaveBeenCalledWith(expect.objectContaining({
      goal: expect.stringContaining("USDt0:4250000"),
    }));
  });

  it("supplies live asset prices when a staged conversion uses native OKB", async () => {
    const response = await POST(request(
      "token", "https://getcobia.com", "Turn 0.005 OKB and 1 USDt0 into USDG", "any",
    ));

    expect(response.status).toBe(200);
    expect(mocks.readIntentAssetPrices).toHaveBeenCalledOnce();
    expect(mocks.compilerOptions).toHaveBeenCalledWith(expect.objectContaining({
      assetPricesUsd: { OKB: "107.41", USDt0: "1", USDG: "1" },
    }));
  });

  it("reports wallet and concurrency limits without invoking the model", async () => {
    for (const [kind, status] of [["limited", 429], ["busy", 409]] as const) {
      mocks.beginCompilation.mockResolvedValueOnce({ kind });
      expect((await POST(request("token"))).status).toBe(status);
    }
    expect(mocks.compile).not.toHaveBeenCalled();
  });
});
