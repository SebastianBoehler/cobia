import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ missing: vi.fn() }));

vi.mock("../../../../lib/runtime/market", () => ({
  missingOwnerNativeBalanceChains: mocks.missing,
}));

import { POST } from "./route";

const owner = "0x1111111111111111111111111111111111111111";

describe("intent native-balance readiness API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the specific execution chain with no native balance", async () => {
    mocks.missing.mockResolvedValueOnce([1]);

    const response = await POST(new Request("https://cobia.example/api/intents/readiness", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner, executionChainIds: [1, 196] }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ missingNativeBalanceChainIds: [1] });
    expect(mocks.missing).toHaveBeenCalledWith({ owner, executionChainIds: [1, 196] });
  });
});
