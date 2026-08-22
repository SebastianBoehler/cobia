import { getAddress, isAddress, keccak256, toBytes, type Address } from "viem";
import { z } from "zod";
import type { SolverToolV1 } from "./types";

const API_URL = "https://api-v2.pendle.finance/core/v2/markets/all?chainId=196&limit=100&skip=0";
const MAX_RESPONSE_BYTES = 2_000_000;

const MarketSchema = z.object({
  name: z.string().trim().min(1).max(80),
  protocol: z.string().trim().min(1).max(120),
  address: z.string().refine(isAddress),
  expiry: z.string().datetime(),
  pt: z.string(),
  yt: z.string(),
  sy: z.string(),
  underlyingAsset: z.string(),
  chainId: z.literal(196),
  details: z.object({
    liquidity: z.number().finite().nonnegative(),
    totalTvl: z.number().finite().nonnegative(),
    underlyingApy: z.number().finite(),
    impliedApy: z.number().finite(),
    aggregatedApy: z.number().finite(),
  }).passthrough(),
}).passthrough();

const ResponseSchema = z.object({ results: z.array(MarketSchema).max(100) }).passthrough();

type Input = { operation: "list" };

export interface PendleXLayerMarketV1 {
  name: string;
  protocol: string;
  market: Address;
  expiry: string;
  pt: Address;
  yt: Address;
  sy: Address;
  underlying: Address;
  liquidityUsd: number;
  totalTvlUsd: number;
  underlyingApy: number;
  impliedApy: number;
  aggregatedApy: number;
}

export interface PendleXLayerToolValueV1 { markets: PendleXLayerMarketV1[] }

function xLayerAddress(asset: string): Address {
  const match = /^196-(0x[0-9a-fA-F]{40})$/.exec(asset);
  if (!match?.[1] || !isAddress(match[1])) throw new Error("Pendle returned an asset outside X Layer");
  return getAddress(match[1]).toLowerCase() as Address;
}

function address(value: string): Address {
  if (!isAddress(value)) throw new Error("Pendle returned an invalid contract address");
  return getAddress(value).toLowerCase() as Address;
}

async function readJson(response: Response) {
  if (!response.ok) throw new Error(`Pendle request failed (${response.status})`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Pendle returned an unsupported content type");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Pendle response exceeded its size limit");
  return { raw: JSON.parse(text) as unknown, sourceHash: keccak256(toBytes(text)) };
}

export function createPendleXLayerToolV1(options: {
  fetcher?: typeof fetch;
  now?: () => number;
} = {}): SolverToolV1<Input, PendleXLayerToolValueV1> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  return {
    id: "pendle.xlayer",
    version: 1,
    async run() {
      try {
        const response = await fetcher(API_URL, {
          method: "GET",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        const { raw, sourceHash } = await readJson(response);
        const markets = ResponseSchema.parse(raw).results.map((market) => ({
          name: market.name,
          protocol: market.protocol,
          market: address(market.address),
          expiry: market.expiry,
          pt: xLayerAddress(market.pt),
          yt: xLayerAddress(market.yt),
          sy: xLayerAddress(market.sy),
          underlying: xLayerAddress(market.underlyingAsset),
          liquidityUsd: market.details.liquidity,
          totalTvlUsd: market.details.totalTvl,
          underlyingApy: market.details.underlyingApy,
          impliedApy: market.details.impliedApy,
          aggregatedApy: market.details.aggregatedApy,
        }));
        if (!markets.length) throw new Error("No X Layer Pendle markets were returned");
        return { status: "ok", sourceHash, fetchedAt: Math.floor(now() / 1_000), value: { markets } };
      } catch (error) {
        return { status: "abstained", code: "PENDLE_XLAYER_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Pendle is unavailable" };
      }
    },
  };
}
