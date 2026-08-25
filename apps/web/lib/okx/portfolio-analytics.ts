import { z } from "zod";
import type { Address } from "viem";
import { signOkxRequest, type OkxCredentials } from "./auth";
import { OkxApiError, readEnvelope } from "./client";

const OKX_ORIGIN = "https://web3.okx.com";
const TOTAL_VALUE_PATH = "/api/v6/dex/balance/total-value-by-address";
const RECENT_PNL_PATH = "/api/v6/dex/market/portfolio/recent-pnl";
const DEX_HISTORY_PATH = "/api/v6/dex/market/portfolio/dex-history";
const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase() as Address);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const SignedDecimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const MillisecondsSchema = z.string().regex(/^\d{13}$/);
const TotalValueSchema = z.array(z.object({
  totalValue: DecimalStringSchema,
}).passthrough()).length(1);
const RecentPnlSchema = z.object({
  pnlList: z.array(z.object({
    chainIndex: z.literal("196"),
    tokenContractAddress: EvmAddressSchema,
    tokenSymbol: z.string().min(1).max(64),
    lastActiveTimestamp: MillisecondsSchema,
    unrealizedPnlUsd: z.union([SignedDecimalStringSchema, z.literal("SELL_ALL")]),
    realizedPnlUsd: SignedDecimalStringSchema,
    totalPnlUsd: SignedDecimalStringSchema,
    totalPnlPercent: SignedDecimalStringSchema,
    tokenBalanceUsd: DecimalStringSchema,
  }).passthrough()),
}).passthrough();
const DexHistorySchema = z.object({
  transactionList: z.array(z.object({
    type: z.enum(["1", "2"]),
    chainIndex: z.literal("196"),
    tokenContractAddress: EvmAddressSchema,
    tokenSymbol: z.string().min(1).max(64),
    valueUsd: DecimalStringSchema,
    amount: DecimalStringSchema,
    price: DecimalStringSchema,
    pnlUsd: SignedDecimalStringSchema,
    time: MillisecondsSchema,
  }).passthrough()),
}).passthrough();

interface OkxPortfolioAnalyticsClientOptions {
  credentials: OkxCredentials;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export function createOkxPortfolioAnalyticsClient(
  options: OkxPortfolioAnalyticsClientOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  const get = async (path: string) => {
    const timestamp = now().toISOString();
    const response = await fetchImpl(`${OKX_ORIGIN}${path}`, {
      method: "GET",
      headers: signOkxRequest({ ...options.credentials, timestamp, method: "GET", path }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new OkxApiError(`HTTP_${response.status}`, `OKX request failed with HTTP ${response.status}`);
    }
    const envelope = readEnvelope(await response.json());
    if (envelope.code !== "0") {
      throw new OkxApiError(envelope.code, envelope.msg || "OKX request failed");
    }
    return { data: envelope.data, timestamp };
  };

  return {
    async getXLayerTotalValue(addressInput: string) {
      const address = EvmAddressSchema.parse(addressInput);
      const query = new URLSearchParams({ address, chains: "196", assetType: "0",
        excludeRiskToken: "true" });
      const { data, timestamp } = await get(`${TOTAL_VALUE_PATH}?${query.toString()}`);
      const parsed = TotalValueSchema.safeParse(data);
      if (!parsed.success) {
        throw new OkxApiError("INVALID_TOTAL_VALUE", "Invalid OKX portfolio total response");
      }
      return { totalValueUsd: parsed.data[0]!.totalValue, fetchedAt: timestamp };
    },

    async getXLayerRecentPnl(addressInput: string, limitInput = 8) {
      const walletAddress = EvmAddressSchema.parse(addressInput);
      const limit = z.number().int().min(1).max(100).parse(limitInput);
      const query = new URLSearchParams({ chainIndex: "196", walletAddress,
        limit: String(limit) });
      const { data } = await get(`${RECENT_PNL_PATH}?${query.toString()}`);
      const parsed = RecentPnlSchema.safeParse(data);
      if (!parsed.success) {
        throw new OkxApiError("INVALID_RECENT_PNL", "Invalid OKX recent PnL response");
      }
      return parsed.data.pnlList.map((item) => ({
        token: item.tokenContractAddress,
        symbol: item.tokenSymbol,
        lastActiveAt: new Date(Number(item.lastActiveTimestamp)).toISOString(),
        totalPnlUsd: item.totalPnlUsd,
        totalPnlPercent: item.totalPnlPercent,
        realizedPnlUsd: item.realizedPnlUsd,
        unrealizedPnlUsd: item.unrealizedPnlUsd,
        balanceUsd: item.tokenBalanceUsd,
      }));
    },

    async getXLayerDexHistory(addressInput: string, optionsInput: { days: number; limit: number }) {
      const walletAddress = EvmAddressSchema.parse(addressInput);
      const options = z.object({ days: z.number().int().min(1).max(90),
        limit: z.number().int().min(1).max(100) }).parse(optionsInput);
      const end = now();
      const begin = new Date(end.getTime() - options.days * 24 * 60 * 60 * 1_000);
      const query = new URLSearchParams({
        chainIndex: "196",
        walletAddress,
        begin: String(begin.getTime()),
        end: String(end.getTime()),
        type: "1,2",
        limit: String(options.limit),
      });
      const { data } = await get(`${DEX_HISTORY_PATH}?${query.toString()}`);
      const parsed = DexHistorySchema.safeParse(data);
      if (!parsed.success) {
        throw new OkxApiError("INVALID_DEX_HISTORY", "Invalid OKX DEX history response");
      }
      const transactions = parsed.data.transactionList.map((item) => ({
        type: item.type === "1" ? "buy" as const : "sell" as const,
        token: item.tokenContractAddress,
        symbol: item.tokenSymbol,
        valueUsd: item.valueUsd,
        amount: item.amount,
        priceUsd: item.price,
        pnlUsd: item.pnlUsd,
        occurredAt: new Date(Number(item.time)).toISOString(),
      })).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return { beginAt: begin.toISOString(), endAt: end.toISOString(), transactions };
    },
  };
}

export type OkxPortfolioAnalyticsClient = ReturnType<typeof createOkxPortfolioAnalyticsClient>;
