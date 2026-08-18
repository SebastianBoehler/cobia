import { describe, expect, it, vi } from "vitest";

const { readPortfolioMock } = vi.hoisted(() => ({ readPortfolioMock: vi.fn() }));

vi.mock("@/lib/portfolio/read-portfolio", () => ({
  readPortfolio: readPortfolioMock,
}));

import { GET } from "./route";

describe("wallet portfolio network boundary", () => {
  it("rejects a query-chain override before any portfolio read", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const response = await GET(
      new Request(`https://getcobia.com/api/wallets/${address}/portfolio?chainId=1952`),
      { params: Promise.resolve({ address }) } as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_CHAIN",
      message: "The requested chain does not match this Cobia host.",
    });
    expect(readPortfolioMock).not.toHaveBeenCalled();
  });

  it("derives chain 1952 from the testnet host", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    readPortfolioMock.mockResolvedValueOnce({ chainId: 1952 });

    const response = await GET(
      new Request(`https://testnet.getcobia.com/api/wallets/${address}/portfolio?chainId=1952`),
      { params: Promise.resolve({ address }) } as never,
    );

    expect(response.status).toBe(200);
    expect(readPortfolioMock).toHaveBeenCalledWith(address, 1952);
  });

  it("ignores a client-supplied forwarded host when deriving the chain", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    readPortfolioMock.mockResolvedValueOnce({ chainId: 1952 });
    const response = await GET(new Request(
      `https://testnet.getcobia.com/api/wallets/${address}/portfolio?chainId=1952`,
      { headers: { "x-forwarded-host": "getcobia.com" } },
    ), { params: Promise.resolve({ address }) } as never);

    expect(response.status).toBe(200);
    expect(readPortfolioMock).toHaveBeenCalledWith(address, 1952);
  });
});
