import { afterEach, describe, expect, it, vi } from "vitest";

const getMarket = vi.fn();

vi.mock("@/lib/runtime/market", () => ({
  getMarketRepository: () => ({ getMarket }),
}));

import { GET } from "./route";

afterEach(() => getMarket.mockReset());

describe("GET /api/markets/:marketId", () => {
  it("passes an explicit bounded history page to the repository", async () => {
    getMarket.mockResolvedValue({ id: "market" });
    const response = await GET(
      new Request("https://cobia.test/api/markets/market?limit=5&cursor=next-page"),
      { params: Promise.resolve({ marketId: "market" }) } as never,
    );

    expect(response.status).toBe(200);
    expect(getMarket).toHaveBeenCalledWith("market", expect.any(Number), {
      limit: 5,
      cursor: "next-page",
    });
  });

  it("rejects an out-of-range history limit before querying", async () => {
    const response = await GET(
      new Request("https://cobia.test/api/markets/market?limit=51"),
      { params: Promise.resolve({ marketId: "market" }) } as never,
    );

    expect(response.status).toBe(400);
    expect(getMarket).not.toHaveBeenCalled();
  });
});
