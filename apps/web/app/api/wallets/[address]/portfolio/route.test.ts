import { describe, expect, it, vi } from "vitest";

const { readPortfolioMock } = vi.hoisted(() => ({ readPortfolioMock: vi.fn() }));

vi.mock("@/lib/portfolio/read-portfolio", () => ({
  readPortfolio: readPortfolioMock,
}));

import { GET } from "./route";

describe("wallet portfolio network boundary", () => {
  it("rejects the historical payment testnet before any portfolio read", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const response = await GET(
      new Request(`https://cobia.example/api/wallets/${address}/portfolio?chainId=1952`),
      { params: Promise.resolve({ address }) } as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_CHAIN",
      message: "Only X Layer mainnet is supported.",
    });
    expect(readPortfolioMock).not.toHaveBeenCalled();
  });
});
