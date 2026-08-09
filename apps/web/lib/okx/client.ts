import { z } from "zod";
import { signOkxRequest, type OkxCredentials } from "./auth";

const OKX_ORIGIN = "https://web3.okx.com";
const PRODUCT_SEARCH_PATH = "/api/v6/defi/product/search";
const PRODUCT_DETAIL_PATH = "/api/v6/defi/product/detail";

const NumericStringSchema = z.union([z.string(), z.number()]).transform(String);

export const RawProductSchema = z
  .object({
    investmentId: NumericStringSchema,
    name: z.string().min(1),
    platformName: z.string().min(1),
    rate: z.string(),
    tvl: z.string(),
    productGroup: z.string().min(1),
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
            chainIndex: NumericStringSchema,
            tokenPrecision: TokenPrecisionSchema,
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
