import { z } from "zod";
import { isAddressEqual, type Address } from "viem";
import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { signOkxRequest, type OkxCredentials } from "./auth";

const OKX_ORIGIN = "https://web3.okx.com";
const PRODUCT_SEARCH_PATH = "/api/v6/defi/product/search";
const PRODUCT_DETAIL_PATH = "/api/v6/defi/product/detail";
const TOKEN_BASIC_PATH = "/api/v6/dex/market/token/basic-info";
const TOKEN_PRICE_PATH = "/api/v6/dex/market/price-info";
const TOKEN_HOLDER_PATH = "/api/v6/dex/market/token/holder";
const TOKEN_SEARCH_PATH = "/api/v6/dex/market/token/search";
const TOKEN_BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";
const DEX_QUOTE_PATH = "/api/v6/dex/aggregator/quote";
export const OKX_REFERENCE_ASSETS = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  196: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
} as const satisfies Record<1 | 196, Address>;

const NumericStringSchema = z.union([z.string(), z.number()]).transform(String);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const OptionalDecimalMetadataSchema = z.union([DecimalStringSchema, z.literal(""), z.null()])
  .optional().transform((value) => value || undefined);
const OptionalAtomicMetadataSchema = z.union([
  z.string().regex(/^\d+$/), z.literal(""), z.null(),
]).optional().transform((value) => value || undefined);
const OptionalStringMetadataSchema = z.union([z.string(), z.null()])
  .optional().transform((value) => value || undefined);

export const RawProductSchema = z
  .object({
    investmentId: NumericStringSchema,
    name: z.string().min(1),
    platformName: z.string().min(1),
    rate: OptionalStringMetadataSchema,
    tvl: OptionalStringMetadataSchema,
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
const TokenBasicSchema = z.object({
  chainIndex: NumericStringSchema, tokenContractAddress: EvmAddressSchema,
  tokenName: z.string().min(1), tokenSymbol: z.string().min(1),
  decimal: z.string().regex(/^\d+$/).transform(Number),
  tagList: z.object({ communityRecognized: z.boolean().optional() })
    .passthrough().optional().default({}),
}).passthrough();
const TokenPriceSchema = z.object({
  chainIndex: NumericStringSchema, tokenContractAddress: EvmAddressSchema,
  time: z.string().regex(/^\d{13}$/), price: OptionalDecimalMetadataSchema,
  liquidity: OptionalDecimalMetadataSchema, holders: OptionalAtomicMetadataSchema,
}).passthrough();
const TokenHolderSchema = z.object({
  holderWalletAddress: EvmAddressSchema,
  holdPercent: DecimalStringSchema,
}).passthrough();
const TokenSearchSchema = TokenBasicSchema.extend({
  price: OptionalDecimalMetadataSchema, liquidity: OptionalDecimalMetadataSchema,
  holders: OptionalAtomicMetadataSchema,
}).passthrough();
const QuoteTokenSchema = z.object({ tokenContractAddress: EvmAddressSchema,
  decimal: z.string().regex(/^\d+$/).transform(Number), isHoneyPot: z.literal(false),
  taxRate: z.literal("0") }).passthrough();
const ExecutableQuoteSchema = z.object({ chainIndex: NumericStringSchema,
  swapMode: z.literal("exactIn"), fromTokenAmount: z.string().regex(/^[1-9][0-9]*$/),
  toTokenAmount: z.string().regex(/^[1-9][0-9]*$/),
  priceImpactPercent: z.string().regex(/^-?\d+(?:\.\d+)?$/),
  dexRouterList: z.array(z.unknown()).min(1), fromToken: QuoteTokenSchema,
  toToken: QuoteTokenSchema }).passthrough();
const WalletTokenBalanceSchema = z.object({
  chainIndex: z.literal("196"), tokenContractAddress: z.union([EvmAddressSchema, z.literal("")]),
  symbol: z.string().min(1).max(64), balance: DecimalStringSchema,
  tokenPrice: OptionalDecimalMetadataSchema, isRiskToken: z.boolean(),
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

function percentToBps(value: string): number {
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const bps = BigInt(whole!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0")) +
    (/[1-9]/.test(fraction.slice(2)) ? 1n : 0n);
  if (bps > 10_000n) throw new OkxApiError("QUOTE_PRICE_IMPACT_INVALID", "OKX price impact is invalid");
  return Number(bps);
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

export function readEnvelope(input: unknown): { code: string; msg: string; data: unknown } {
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

  const searchTokens = async (chainId: 1 | 196, searchInput: string) => {
    const search = z.string().trim().min(1).max(64).parse(searchInput);
    const path = `${TOKEN_SEARCH_PATH}?chains=${chainId}&search=${encodeURIComponent(search)}&limit=100`;
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
    return parsed.data.filter((item) => item.chainIndex === String(chainId)).map((item) => ({
      chainId, token: item.tokenContractAddress, name: item.tokenName, symbol: item.tokenSymbol,
      decimals: item.decimal, priceUsd: item.price, liquidityUsd: item.liquidity,
      holderCount: item.holders,
    }));
  };

  const searchToken = async (chainId: 1 | 196, searchInput: string) => {
    const search = z.string().trim().min(1).max(64).parse(searchInput);
    const tokens = await searchTokens(chainId, search);
    const address = EvmAddressSchema.safeParse(search);
    const exact = tokens.filter((item) => address.success
      ? item.token === address.data
      : item.symbol.toLowerCase() === search.toLowerCase());
    if (exact.length > 1) throw new OkxApiError("AMBIGUOUS_TOKEN", "OKX token symbol is ambiguous");
    return exact[0];
  };

  const getTokenEvidence = async (chainId: 1 | 196, tokenInput: string) => {
    const token = EvmAddressSchema.parse(tokenInput);
    const chainIndex = String(chainId);
    const body = JSON.stringify([{ chainIndex, tokenContractAddress: token }]);
    const holderPath = `${TOKEN_HOLDER_PATH}?chainIndex=${chainIndex}&tokenContractAddress=${token}&limit=10`;
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
    const identity = basic.data[0]!;
    const market = price.data[0]!;
    if (identity.chainIndex !== chainIndex || market.chainIndex !== chainIndex ||
        identity.tokenContractAddress !== token || market.tokenContractAddress !== token) {
      throw new OkxApiError("TOKEN_IDENTITY_MISMATCH", "OKX token identity mismatch");
    }
    const marketTime = Number(market.time);
    if (!Number.isSafeInteger(marketTime)) {
      throw new OkxApiError("INVALID_MARKET_TIME", "Invalid OKX token market timestamp");
    }
    return {
      chainId, token, name: identity.tokenName, symbol: identity.tokenSymbol,
      decimals: identity.decimal, priceUsd: market.price, liquidityUsd: market.liquidity,
      holderCount: market.holders,
      top10HolderPercent: sumDecimalStrings(holders.data.map(({ holdPercent }) => holdPercent)),
      topHolderAddresses: holders.data.map(({ holderWalletAddress }) => holderWalletAddress),
      marketDataAt: new Date(marketTime).toISOString(),
      communityRecognized: identity.tagList.communityRecognized ?? false,
    };
  };

  return {
    searchToken,
    searchTokens,
    getTokenEvidence,
    async getExecutableQuote(chainId: 1 | 196, tokenInput: string, inputAtomic: string) {
      const fromToken = EvmAddressSchema.parse(tokenInput);
      if (!/^[1-9][0-9]*$/.test(inputAtomic)) {
        throw new OkxApiError("QUOTE_AMOUNT_INVALID", "OKX quote amount is invalid");
      }
      const toToken = OKX_REFERENCE_ASSETS[chainId];
      const query = new URLSearchParams({ amount: inputAtomic, chainIndex: String(chainId),
        fromTokenAddress: fromToken, toTokenAddress: toToken, swapMode: "exactIn",
        priceImpactProtectionPercent: "5" });
      const path = `${DEX_QUOTE_PATH}?${query.toString()}`;
      const timestamp = now().toISOString();
      const response = await fetchImpl(`${OKX_ORIGIN}${path}`, { method: "GET",
        headers: signOkxRequest({ ...options.credentials, timestamp, method: "GET", path }),
        cache: "no-store" });
      if (!response.ok) throw new OkxApiError(`HTTP_${response.status}`,
        `OKX request failed with HTTP ${response.status}`);
      const envelope = readEnvelope(await response.json());
      if (envelope.code !== "0") throw new OkxApiError(envelope.code, envelope.msg || "OKX request failed");
      const parsed = z.array(ExecutableQuoteSchema).length(1).safeParse(envelope.data);
      if (!parsed.success) throw new OkxApiError("INVALID_EXECUTABLE_QUOTE", "Invalid OKX quote response");
      const quote = parsed.data[0]!;
      if (quote.chainIndex !== String(chainId) || quote.fromTokenAmount !== inputAtomic ||
          quote.fromToken.tokenContractAddress !== fromToken || quote.toToken.tokenContractAddress !== toToken) {
        throw new OkxApiError("QUOTE_IDENTITY_MISMATCH", "OKX quote identity mismatch");
      }
      const priceImpactBps = percentToBps(quote.priceImpactPercent);
      if (priceImpactBps > 500) {
        throw new OkxApiError("QUOTE_PRICE_IMPACT_EXCEEDED", "OKX quote price impact exceeds 5%");
      }
      return { chainId, fromToken, toToken, inputAtomic, outputAtomic: quote.toTokenAmount,
        outputDecimals: quote.toToken.decimal, priceImpactBps,
        fetchedAt: timestamp, route: quote.dexRouterList };
    },
    async getXLayerNativeTokenEvidence() {
      const token = await searchToken(196, "OKB");
      if (!token || !isAddressEqual(token.token, NATIVE_ASSET_ADDRESS) ||
          token.symbol !== "OKB" || token.decimals !== 18 ||
          !token.priceUsd || !token.liquidityUsd) {
        throw new OkxApiError("NATIVE_IDENTITY_MISMATCH",
          "Exact X Layer OKB market identity is unavailable");
      }
      return {
        assetType: "native" as const, chainId: 196 as const, token: NATIVE_ASSET_ADDRESS,
        name: token.name,
        symbol: "OKB" as const, decimals: 18 as const,
        priceUsd: token.priceUsd, liquidityUsd: token.liquidityUsd,
        marketDataAt: now().toISOString(),
      };
    },
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
      const token = await searchToken(196, searchInput);
      return token ? { ...token, chainId: 196 as const } : undefined;
    },

    async searchXLayerTokens(searchInput: string) {
      return (await searchTokens(196, searchInput)).map((token) => ({ ...token, chainId: 196 as const }));
    },

    async getXLayerTokenEvidence(tokenInput: string) {
      const evidence = await getTokenEvidence(196, tokenInput);
      if (!evidence.priceUsd || !evidence.liquidityUsd || !evidence.holderCount) {
        throw new OkxApiError("MARKET_METADATA_UNAVAILABLE",
          "Exact X Layer token market metadata is unavailable");
      }
      return { chainId: 196 as const, token: evidence.token, name: evidence.name,
        symbol: evidence.symbol, decimals: evidence.decimals, priceUsd: evidence.priceUsd,
        liquidityUsd: evidence.liquidityUsd, holderCount: evidence.holderCount,
        top10HolderPercent: evidence.top10HolderPercent, marketDataAt: evidence.marketDataAt,
        communityRecognized: evidence.communityRecognized };
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
