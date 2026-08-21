import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listActivity: vi.fn() }));
vi.mock("@/lib/runtime/market", () => ({
  getActivityRepository: () => ({ listActivity: mocks.listActivity }),
}));

import { GET } from "./route";

const address = "0x1111111111111111111111111111111111111111";
const context = { params: Promise.resolve({ address }) } as never;

describe("wallet activity API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("briefly caches public wallet activity", async () => {
    mocks.listActivity.mockResolvedValueOnce([]);

    const response = await GET(new Request(`https://getcobia.com/api/wallets/${address}/activity`), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=10, stale-while-revalidate=20");
  });

  it("returns a stable error without leaking database details", async () => {
    mocks.listActivity.mockRejectedValueOnce(new Error("select from internal_schema failed"));

    const response = await GET(new Request(`https://getcobia.com/api/wallets/${address}/activity`), context);

    await expect(response.json()).resolves.toEqual({
      code: "ACTIVITY_UNAVAILABLE",
      message: "Wallet activity is temporarily unavailable.",
    });
  });
});
