import { getAddress, isAddress, keccak256, toBytes, type Address } from "viem";
import { z } from "zod";
import type { SolverToolV1 } from "./types";

const API_ROOT = "https://api.xstocks.fi/api/v2/public/assets";
const MAX_RESPONSE_BYTES = 2_000_000;

const StablecoinSchema = z.object({
  symbol: z.string().min(1).max(16),
  address: z.string().refine(isAddress),
  decimals: z.number().int().min(0).max(36),
  issuance: z.boolean(),
  redemption: z.boolean(),
  supportsAtomicSwaps: z.boolean(),
}).passthrough();

const DeploymentSchema = z.object({
  address: z.string().refine(isAddress),
  network: z.literal("XLayer"),
  wrapperAddressV2: z.string().refine(isAddress).optional(),
  supportsAtomicSwaps: z.boolean(),
  stablecoins: z.array(StablecoinSchema).max(32),
}).passthrough();

const AssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  symbol: z.string().regex(/^[A-Za-z0-9.]{2,16}$/),
  isin: z.string().min(4).max(32),
  underlyingSymbol: z.string().min(1).max(32),
  underlyingIsin: z.string().min(4).max(32),
  isTradingHalted: z.boolean(),
  deployments: z.array(z.unknown()).max(32),
}).passthrough();

const PageSchema = z.object({
  nodes: z.array(AssetSchema).max(100),
  page: z.object({ currentPage: z.number().int().nonnegative(), hasNextPage: z.boolean() }).strict(),
}).passthrough();

type Input =
  | { operation: "get"; symbol: string }
  | { operation: "list"; page: number };

export interface XStocksInstrumentV1 {
  id: string;
  name: string;
  symbol: string;
  isin: string;
  underlyingSymbol: string;
  underlyingIsin: string;
  isTradingHalted: boolean;
  deployment: {
    address: Address;
    network: "XLayer";
    wrapperAddressV2?: Address;
    supportsAtomicSwaps: boolean;
    stablecoins: Array<{
      symbol: string;
      address: Address;
      decimals: number;
      issuance: boolean;
      redemption: boolean;
      supportsAtomicSwaps: boolean;
    }>;
  };
}

export interface XStocksToolValueV1 {
  assets: XStocksInstrumentV1[];
  page?: number;
  hasNextPage?: boolean;
}

function xLayerAsset(raw: z.infer<typeof AssetSchema>): XStocksInstrumentV1 | undefined {
  const deployment = raw.deployments.flatMap((value) => {
    const parsed = DeploymentSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  })[0];
  if (!deployment) return undefined;
  return {
    id: raw.id,
    name: raw.name,
    symbol: raw.symbol,
    isin: raw.isin,
    underlyingSymbol: raw.underlyingSymbol,
    underlyingIsin: raw.underlyingIsin,
    isTradingHalted: raw.isTradingHalted,
    deployment: {
      address: getAddress(deployment.address).toLowerCase() as Address,
      network: deployment.network,
      wrapperAddressV2: deployment.wrapperAddressV2
        ? getAddress(deployment.wrapperAddressV2).toLowerCase() as Address : undefined,
      supportsAtomicSwaps: deployment.supportsAtomicSwaps,
      stablecoins: deployment.stablecoins.map((stablecoin) => ({
        symbol: stablecoin.symbol,
        address: getAddress(stablecoin.address).toLowerCase() as Address,
        decimals: stablecoin.decimals,
        issuance: stablecoin.issuance,
        redemption: stablecoin.redemption,
        supportsAtomicSwaps: stablecoin.supportsAtomicSwaps,
      })),
    },
  };
}

async function readJson(response: Response) {
  if (!response.ok) throw new Error(`xStocks request failed (${response.status})`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("xStocks returned an unsupported content type");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("xStocks response exceeded its size limit");
  return { raw: JSON.parse(text) as unknown, sourceHash: keccak256(toBytes(text)) };
}

export function createXStocksInstrumentToolV1(options: {
  fetcher?: typeof fetch;
  now?: () => number;
} = {}): SolverToolV1<Input, XStocksToolValueV1> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  return {
    id: "rwa.instruments",
    version: 1,
    async run(input) {
      if ((input.operation === "get" && !/^[A-Za-z0-9.]{2,16}$/.test(input.symbol)) ||
        (input.operation === "list" && (!Number.isSafeInteger(input.page) || input.page < 0 || input.page > 99))) {
        return { status: "abstained", code: "XSTOCKS_REQUEST_INVALID", message: "The xStocks query is invalid" };
      }
      try {
        const url = input.operation === "get"
          ? `${API_ROOT}/${encodeURIComponent(input.symbol)}`
          : `${API_ROOT}?page=${input.page}`;
        const response = await fetcher(url, {
          method: "GET",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        const { raw, sourceHash } = await readJson(response);
        const parsed = input.operation === "get"
          ? { assets: [xLayerAsset(AssetSchema.parse(raw))].filter((value) => value !== undefined) }
          : (() => {
              const page = PageSchema.parse(raw);
              return { assets: page.nodes.map(xLayerAsset).filter((value) => value !== undefined),
                page: page.page.currentPage, hasNextPage: page.page.hasNextPage };
            })();
        return { status: "ok", sourceHash, fetchedAt: Math.floor(now() / 1_000), value: parsed };
      } catch (error) {
        return { status: "abstained", code: "XSTOCKS_UNAVAILABLE",
          message: error instanceof Error ? error.message : "xStocks is unavailable" };
      }
    },
  };
}
