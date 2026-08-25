import { describe, expect, it, vi } from "vitest";
import { createOkxPortfolioAnalyticsClient } from "./portfolio-analytics";

const credentials = { apiKey: "key", secretKey: "secret", passphrase: "pass" };
const owner = "0x1111111111111111111111111111111111111111";

describe("OKX indexed portfolio analytics", () => {
  it("returns the indexed total value for X Layer tokens and DeFi assets", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: "0",
      msg: "",
      data: [{ totalValue: "1172.8950571770658645" }],
    }));
    const client = createOkxPortfolioAnalyticsClient({
      credentials,
      fetchImpl,
      now: () => new Date("2026-08-25T10:00:00.000Z"),
    });

    await expect(client.getXLayerTotalValue(owner)).resolves.toEqual({
      totalValueUsd: "1172.8950571770658645",
      fetchedAt: "2026-08-25T10:00:00.000Z",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://web3.okx.com/api/v6/dex/balance/total-value-by-address?address=${owner}&chains=196&assetType=0&excludeRiskToken=true`,
    );
  });

  it("returns recent token PnL with exact X Layer identity", async () => {
    const token = "0x2222222222222222222222222222222222222222";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: "0",
      msg: "",
      data: {
        pnlList: [{
          chainIndex: "196",
          tokenContractAddress: token,
          tokenSymbol: "USDG",
          lastActiveTimestamp: "1787651400000",
          unrealizedPnlUsd: "-4.25",
          unrealizedPnlPercent: "-1.20",
          realizedPnlUsd: "12.50",
          realizedPnlPercent: "3.50",
          totalPnlUsd: "8.25",
          totalPnlPercent: "2.30",
          tokenBalanceUsd: "1060.00",
          tokenBalanceAmount: "1060",
          tokenPositionPercent: "60.00",
          tokenPositionDuration: { holdingTimestamp: "1787000000000", sellOffTimestamp: "" },
          buyTxCount: "3",
          buyTxVolume: "1051.75",
          buyAvgPrice: "0.99",
          sellTxCount: "1",
          sellTxVolume: "200.00",
          sellAvgPrice: "1.01",
        }],
      },
    }));
    const client = createOkxPortfolioAnalyticsClient({ credentials, fetchImpl });

    await expect(client.getXLayerRecentPnl(owner, 8)).resolves.toEqual([{
      token,
      symbol: "USDG",
      lastActiveAt: "2026-08-25T09:50:00.000Z",
      totalPnlUsd: "8.25",
      totalPnlPercent: "2.30",
      realizedPnlUsd: "12.50",
      unrealizedPnlUsd: "-4.25",
      balanceUsd: "1060.00",
    }]);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://web3.okx.com/api/v6/dex/market/portfolio/recent-pnl?chainIndex=196&walletAddress=${owner}&limit=8`,
    );
  });

  it("returns 30-day X Layer buy and sell activity in reverse chronological order", async () => {
    const token = "0x2222222222222222222222222222222222222222";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: "0",
      msg: "",
      data: {
        transactionList: [{
          type: "1",
          chainIndex: "196",
          tokenContractAddress: token,
          tokenSymbol: "USDG",
          valueUsd: "250.00",
          amount: "250",
          price: "1.00",
          marketCap: "1000000",
          pnlUsd: "4.50",
          time: "1787651400000",
        }],
        cursor: "0",
      },
    }));
    const client = createOkxPortfolioAnalyticsClient({
      credentials,
      fetchImpl,
      now: () => new Date("2026-08-25T10:00:00.000Z"),
    });

    await expect(client.getXLayerDexHistory(owner, { days: 30, limit: 8 })).resolves.toEqual({
      beginAt: "2026-07-26T10:00:00.000Z",
      endAt: "2026-08-25T10:00:00.000Z",
      transactions: [{
        type: "buy",
        token,
        symbol: "USDG",
        valueUsd: "250.00",
        amount: "250",
        priceUsd: "1.00",
        pnlUsd: "4.50",
        occurredAt: "2026-08-25T09:50:00.000Z",
      }],
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://web3.okx.com/api/v6/dex/market/portfolio/dex-history?chainIndex=196&walletAddress=${owner}&begin=1785060000000&end=1787652000000&type=1%2C2&limit=8`,
    );
  });
});
