import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPortfolio: vi.fn() }));
vi.mock("@/lib/portfolio/read-portfolio", () => ({ readPortfolio: mocks.readPortfolio }));

import { GET } from "./route";

const address = "0x1111111111111111111111111111111111111111";
const context = { params: Promise.resolve({ address }) } as never;

describe("wallet portfolio API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("briefly caches public chain state by wallet address", async () => {
    mocks.readPortfolio.mockResolvedValueOnce({ address, chainId: 196, balances: [] });

    const response = await GET(
      new Request(`https://getcobia.com/api/wallets/${address}/portfolio?chainId=196`),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("public, max-age=0, s-maxage=10, stale-while-revalidate=20");
  });

  it("returns a stable error without leaking an upstream portfolio failure", async () => {
    mocks.readPortfolio.mockRejectedValueOnce(new Error("upstream endpoint with secret query failed"));

    const response = await GET(
      new Request(`https://getcobia.com/api/wallets/${address}/portfolio?chainId=196`),
      context,
    );

    await expect(response.json()).resolves.toEqual({
      code: "PORTFOLIO_UNAVAILABLE",
      message: "Portfolio sources are temporarily unavailable.",
    });
  });
});
