import { z } from "zod";
import type { Address } from "viem";
import { signOkxRequest, type OkxCredentials } from "./auth";

const OKX_ORIGIN = "https://web3.okx.com";
const PRODUCT_SEARCH_PATH = "/api/v6/defi/product/search";
const PRODUCT_DETAIL_PATH = "/api/v6/defi/product/detail";
const TOKEN_BASIC_PATH = "/api/v6/dex/market/token/basic-info";
const TOKEN_PRICE_PATH = "/api/v6/dex/market/price-info";
const TOKEN_HOLDER_PATH = "/api/v6/dex/market/token/holder";
const TOKEN_SEARCH_PATH = "/api/v6/dex/market/token/search";
const TOKEN_BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";

const NumericStringSchema = z.union([z.string(), z.number()]).transform(String);

export const RawProductSchema = z
  .object({
    investmentId: NumericStringSchema,
    name: z.string().min(1),
    platformName: z.string().min(1),
    rate: z.string(),
    tvl: z.string(),
    productGroup: z.string().min(1).nullish(),
    chainIndex: NumericStringSchema,
  })
  .passthrough();

const TokenPrecisionSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]);

export const RawProductDetailSchema = z
  .object({
    investmentId: NumericStringSchema,
    investmentName: z.string().min(1),
    platformName: z.string().min(1),
    chainIndex: NumericStringSchema,
    rate: z.string(),
    tvl: z.string(),
    isInvestable: z.boolean(),
    utilizationRate: z.string(),
    underlyingToken: z
      .array(
        z
          .object({
            tokenSymbol: z.string().min(1),
            tokenAddress: z.string().min(1),
            chainIndex: NumericStringSchema.optional(),
            tokenPrecision: TokenPrecisionSchema.optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const ProductSearchDataSchema = z.object({
  total: z.number().int().nonnegative().optional(),
  list: z.array(RawProductSchema),
});

const ProductSearchQuerySchema = z
  .object({
    tokenKeywordList: z.array(z.string().min(1)).min(1),
    platformKeywordList: z.array(z.string().min(1)).min(1).optional(),
    chainIndex: z.literal("196"),
    productGroup: z.enum(["SINGLE_EARN", "DEX_POOL", "LENDING"]).optional(),
    pageNum: z.number().int().positive().optional(),
  })
  .strict();

const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase() as Address);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const TokenBasicSchema = z.object({
  chainIndex: z.literal("196"), tokenContractAddress: EvmAddressSchema,
  tokenName: z.string().min(1), tokenSymbol: z.string().min(1),
  decimal: z.string().regex(/^\d+$/).transform(Number),
  tagList: z.object({ communityRecognized: z.boolean().optional() }).passthrough(),
}).passthrough();
const TokenPriceSchema = z.object({
  chainIndex: z.literal("196"), tokenContractAddress: EvmAddressSchema,
  time: z.string().regex(/^\d{13}$/), price: DecimalStringSchema,
  liquidity: DecimalStringSchema, holders: z.string().regex(/^\d+$/),
}).passthrough();
const TokenHolderSchema = z.object({
  holderWalletAddress: EvmAddressSchema,
  holdPercent: DecimalStringSchema,
}).passthrough();
const TokenSearchSchema = TokenBasicSchema.extend({
  price: DecimalStringSchema, liquidity: DecimalStringSchema,
  holders: z.union([z.string().regex(/^\d+$/), z.literal("")])
    .transform((value) => value || undefined),
}).passthrough();
const WalletTokenBalanceSchema = z.object({
  chainIndex: z.literal("196"), tokenContractAddress: z.union([EvmAddressSchema, z.literal("")]),
  symbol: z.string().min(1).max(64), balance: DecimalStringSchema,
  tokenPrice: DecimalStringSchema, isRiskToken: z.boolean(),
}).passthrough();
type WalletTokenBalance = z.infer<typeof WalletTokenBalanceSchema>;

function isErc20WalletToken(
  token: WalletTokenBalance,
): token is WalletTokenBalance & { tokenContractAddress: Address } {
  return !token.isRiskToken && token.tokenContractAddress !== "";
}
const WalletTokenBalanceResponseSchema = z.array(z.object({
  tokenAssets: z.array(WalletTokenBalanceSchema),
}).passthrough());

function sumDecimalStrings(values: readonly string[]): string {
  const scale = 18;
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    if (fraction.length > scale) throw new OkxApiError("INVALID_HOLDER_DATA", "Invalid OKX holder percentage");
    return sum + BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  }, 0n);
  const text = total.toString().padStart(scale + 1, "0");
  const fraction = text.slice(-scale).replace(/0+$/, "");
  return fraction ? `${text.slice(0, -scale)}.${fraction}` : text.slice(0, -scale);
}

export type RawProduct = z.infer<typeof RawProductSchema>;
export type RawProductDetail = z.infer<typeof RawProductDetailSchema>;
export type ProductSearchQuery = z.input<typeof ProductSearchQuerySchema>;

interface OkxClientOptions {
  credentials: OkxCredentials;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class OkxApiError extends Error {
  override readonly name = "OkxApiError";

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

function readEnvelope(input: unknown): { code: string; msg: string; data: unknown } {
  const parsed = z
    .object({
      code: NumericStringSchema,
      msg: z.string(),
      data: z.unknown(),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new OkxApiError("INVALID_ENVELOPE", "Invalid OKX response envelope");
  }
  return parsed.data;
}

export function createOkxClient(options: OkxClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    async listXLayerTokenBalances(addressInput: string) {
      const address = EvmAddressSchema.parse(addressInput);
      const path = `${TOKEN_BALANCES_PATH}?address=${address}&chains=196`;
      const timestamp = now().toISOString();
      const response = await fetchImpl(`${OKX_ORIGIN}${path}`, { method: "GET",
        headers: signOkxRequest({ ...options.credentials, timestamp, method: "GET", path }),
        cache: "no-store" });
      if (!response.ok) throw new OkxApiError(`HTTP_${response.status}`,
        `OKX request failed with HTTP ${response.status}`);
      const envelope = readEnvelope(await response.json());
      if (envelope.code !== "0") throw new OkxApiError(envelope.code,
        envelope.msg || "OKX request failed");
      const data = WalletTokenBalanceResponseSchema.safeParse(envelope.data);
      if (!data.success) throw new OkxApiError("INVALID_WALLET_BALANCES",
        "Invalid OKX wallet balance response");
      return data.data.flatMap(({ tokenAssets }) => tokenAssets)
        .filter(isErc20WalletToken)
        .map(({ tokenContractAddress: token, symbol, balance, tokenPrice: priceUsd }) => ({
          chainId: 196 as const, token, symbol, balance, priceUsd,
        }));
    },

    async searchXLayerToken(searchInput: string) {
      const search = z.string().trim().min(1).max(64).parse(searchInput);
      const path = `${TOKEN_SEARCH_PATH}?chains=196&search=${encodeURIComponent(search)}&limit=100`;
      const timestamp = now().toISOString();
      const response = await fetchImpl(`${OKX_ORIGIN}${path}`, { method: "GET",
        headers: signOkxRequest({ ...options.credentials, timestamp, method: "GET", path }),
        cache: "no-store" });
      if (!response.ok) throw new OkxApiError(`HTTP_${response.status}`,
        `OKX request failed with HTTP ${response.status}`);
      const envelope = readEnvelope(await response.json());
      if (envelope.code !== "0") throw new OkxApiError(envelope.code,
        envelope.msg || "OKX request failed");
      const parsed = z.array(TokenSearchSchema).safeParse(envelope.data);
      if (!parsed.success) throw new OkxApiError("INVALID_TOKEN_SEARCH", "Invalid OKX token search response");
      const address = EvmAddressSchema.safeParse(search);
      const exact = parsed.data.filter((item) => address.success
        ? item.tokenContractAddress === address.data
        : item.tokenSymbol.toLowerCase() === search.toLowerCase());
      if (exact.length > 1) throw new OkxApiError("AMBIGUOUS_TOKEN", "OKX token symbol is ambiguous");
      const item = exact[0];
      return item ? { chainId: 196 as const, token: item.tokenContractAddress,
        name: item.tokenName, symbol: item.tokenSymbol, decimals: item.decimal,
        priceUsd: item.price, liquidityUsd: item.liquidity, holderCount: item.holders } : undefined;
    },

    async getXLayerTokenEvidence(tokenInput: string) {
      const token = EvmAddressSchema.parse(tokenInput);
      const body = JSON.stringify([{ chainIndex: "196", tokenContractAddress: token }]);
      const holderPath = `${TOKEN_HOLDER_PATH}?chainIndex=196&tokenContractAddress=${token}&limit=10`;
      const signedFetch = async (path: string, method: "GET" | "POST", requestBody?: string) => {
        const timestamp = now().toISOString();
        const response = await fetchImpl(`${OKX_ORIGIN}${path}`, {
          method, headers: signOkxRequest({ ...options.credentials, timestamp, method, path,
            body: requestBody }), body: requestBody, cache: "no-store",
        });
        if (!response.ok) throw new OkxApiError(`HTTP_${response.status}`,
          `OKX request failed with HTTP ${response.status}`);
        const envelope = readEnvelope(await response.json());
        if (envelope.code !== "0") throw new OkxApiError(envelope.code,
          envelope.msg || "OKX request failed");
        return envelope.data;
      };
      const [basicValue, priceValue, holderValue] = await Promise.all([
        signedFetch(TOKEN_BASIC_PATH, "POST", body),
        signedFetch(TOKEN_PRICE_PATH, "POST", body),
        signedFetch(holderPath, "GET"),
      ]);
      const basic = z.array(TokenBasicSchema).length(1).safeParse(basicValue);
      const price = z.array(TokenPriceSchema).length(1).safeParse(priceValue);
      const holders = z.array(TokenHolderSchema).max(10).safeParse(holderValue);
      if (!basic.success || !price.success || !holders.success) {
        throw new OkxApiError("INVALID_MARKET_DATA", "Invalid OKX token market response");
      }
      if (basic.data[0]!.tokenContractAddress !== token || price.data[0]!.tokenContractAddress !== token) {
        throw new OkxApiError("TOKEN_IDENTITY_MISMATCH", "OKX token identity mismatch");
      }
      const marketTime = Number(price.data[0]!.time);
      if (!Number.isSafeInteger(marketTime)) {
        throw new OkxApiError("INVALID_MARKET_TIME", "Invalid OKX token market timestamp");
      }
      return {
        chainId: 196 as const, token, name: basic.data[0]!.tokenName,
        symbol: basic.data[0]!.tokenSymbol, decimals: basic.data[0]!.decimal,
        priceUsd: price.data[0]!.price, liquidityUsd: price.data[0]!.liquidity,
        holderCount: price.data[0]!.holders,
        top10HolderPercent: sumDecimalStrings(holders.data.map(({ holdPercent }) => holdPercent)),
        marketDataAt: new Date(marketTime).toISOString(),
        communityRecognized: basic.data[0]!.tagList.communityRecognized ?? false,
      };
    },

    async searchProducts(query: ProductSearchQuery): Promise<RawProduct[]> {
      const parsedQuery = ProductSearchQuerySchema.parse(query);
      const body = JSON.stringify(parsedQuery);
      const timestamp = now().toISOString();
      const response = await fetchImpl(`${OKX_ORIGIN}${PRODUCT_SEARCH_PATH}`, {
        method: "POST",
        headers: signOkxRequest({
          ...options.credentials,
          timestamp,
          method: "POST",
          path: PRODUCT_SEARCH_PATH,
          body,
        }),
        body,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new OkxApiError(
          `HTTP_${response.status}`,
          `OKX request failed with HTTP ${response.status}`,
        );
      }
      const envelope = readEnvelope(await response.json());
      if (envelope.code !== "0") {
        throw new OkxApiError(envelope.code, envelope.msg || "OKX request failed");
      }

      const data = ProductSearchDataSchema.safeParse(envelope.data);
      if (!data.success) {
        throw new OkxApiError("INVALID_PRODUCT_DATA", "Invalid OKX product response", {
          cause: data.error,
        });
      }
      return data.data.list;
    },

    async getProductDetail(investmentId: string): Promise<RawProductDetail> {
      if (!/^\d+$/.test(investmentId)) {
        throw new OkxApiError("INVALID_INVESTMENT_ID", "Invalid OKX investment ID");
      }
      const path = `${PRODUCT_DETAIL_PATH}?investmentId=${encodeURIComponent(investmentId)}`;
      const timestamp = now().toISOString();
      const response = await fetchImpl(`${OKX_ORIGIN}${path}`, {
        method: "GET",
        headers: signOkxRequest({
          ...options.credentials,
          timestamp,
          method: "GET",
          path,
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new OkxApiError(
          `HTTP_${response.status}`,
          `OKX request failed with HTTP ${response.status}`,
        );
      }
      const envelope = readEnvelope(await response.json());
      if (envelope.code !== "0") {
        throw new OkxApiError(envelope.code, envelope.msg || "OKX request failed");
      }
      const detail = RawProductDetailSchema.safeParse(envelope.data);
      if (!detail.success) {
        throw new OkxApiError("INVALID_PRODUCT_DETAIL", "Invalid OKX product detail", {
          cause: detail.error,
        });
      }
      return detail.data;
    },
  };
}

export type OkxClient = ReturnType<typeof createOkxClient>;
