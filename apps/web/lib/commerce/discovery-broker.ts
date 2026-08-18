import { canonicalJson, type CommerceOfferV1 } from "@cobia/domain";
import { keccak256, stringToHex, type Address, type Hash } from "viem";
import { assertPublicCommerceUrlV1 } from "./network-policy";
import {
  normalizeX402ResourceV1,
  parseX402BazaarResourcesV2,
  x402PaymentRequiredCommitmentV1,
} from "./x402-wire";

const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REDIRECTS = 3;
const ZERO_HASH = `0x${"0".repeat(64)}` as Hash;

export type CommerceHttpResponseV1 = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
};

export type CommerceFetchV1 = (request: {
  url: string;
  resolvedAddress: string;
  timeoutMs: number;
  maxBytes: number;
  headers: Readonly<Record<string, string>>;
}) => Promise<CommerceHttpResponseV1>;

export type DnsResolverV1 = (hostname: string) => Promise<readonly string[]>;

export type CommerceDiscoverySourceV1 = {
  id: string;
  protocol: "x402-bazaar";
  url: string;
  trustedMerchants: Readonly<Record<string, { manifestHash: Hash }>>;
};

export type CommerceDiscoverySourceErrorV1 = {
  sourceId: string;
  code: "DISCOVERY_NETWORK_BLOCKED" | "DISCOVERY_RESPONSE_TOO_LARGE" |
    "DISCOVERY_SOURCE_INVALID" | "DISCOVERY_PROTOCOL_UNSUPPORTED";
  message: string;
};

async function fetchValidated(
  source: CommerceDiscoverySourceV1,
  dnsResolver: DnsResolverV1,
  fetcher: CommerceFetchV1,
): Promise<CommerceHttpResponseV1> {
  let current = source.url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const preliminary = new URL(current);
    const addresses = await dnsResolver(preliminary.hostname);
    const url = assertPublicCommerceUrlV1(current, addresses);
    const response = await fetcher({
      url: url.toString(),
      resolvedAddress: addresses[0]!,
      timeoutMs: 5_000,
      maxBytes: MAX_RESPONSE_BYTES,
      headers: { accept: "application/json", "user-agent": "Cobia-Commerce-Discovery/1" },
    });
    if (response.body.byteLength > MAX_RESPONSE_BYTES) {
      throw Object.assign(new Error("Commerce discovery response exceeds size limit"), { code: "DISCOVERY_RESPONSE_TOO_LARGE" });
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Commerce discovery redirect is invalid");
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error("Commerce discovery exceeded redirects");
}

function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new Error("Commerce discovery source returned invalid JSON");
  }
}

function normalizeBazaar(
  source: CommerceDiscoverySourceV1,
  response: CommerceHttpResponseV1,
  nowSec: number,
  receiptRecipient: Address,
): CommerceOfferV1[] {
  const payload = parseX402BazaarResourcesV2(parseJson(response.body));
  return payload.items.map((item) => {
    const accepted = item.accepts[0]!;
    const merchant = source.trustedMerchants[accepted.payTo.toLowerCase()];
    const required = {
      x402Version: 2 as const,
      resource: {
        url: item.resource,
        ...(item.description ?? item.metadata?.description
          ? { description: item.description ?? item.metadata?.description }
          : {}),
        ...(item.serviceName ? { serviceName: item.serviceName } : {}),
        ...(item.tags ? { tags: item.tags } : {}),
        ...(item.iconUrl ? { iconUrl: item.iconUrl } : {}),
      },
      accepts: item.accepts,
      extensions: {},
    };
    const productId = keccak256(stringToHex(item.resource)).slice(2, 18);
    return normalizeX402ResourceV1({
      paymentRequired: required,
      rawResponse: response.body,
      fetchedAt: nowSec,
      expiresAt: nowSec + Math.min(300, accepted.maxTimeoutSeconds),
      sourceUrl: source.url,
      merchantId: new URL(item.resource).hostname,
      manifestHash: merchant?.manifestHash ?? ZERO_HASH,
      productId,
      productCommitment: x402PaymentRequiredCommitmentV1(required),
      receiptRecipient,
      merchantRegistered: Boolean(merchant),
    });
  });
}

function errorCode(error: unknown): CommerceDiscoverySourceErrorV1["code"] {
  if (typeof error === "object" && error && "code" in error && error.code === "DISCOVERY_RESPONSE_TOO_LARGE") {
    return "DISCOVERY_RESPONSE_TOO_LARGE";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/DNS|blocked|HTTPS|credential|\bport\b|redirect/i.test(message)) return "DISCOVERY_NETWORK_BLOCKED";
  return "DISCOVERY_SOURCE_INVALID";
}

export async function discoverCommerceOffersV1(input: {
  sources: readonly CommerceDiscoverySourceV1[];
  dnsResolver: DnsResolverV1;
  fetcher: CommerceFetchV1;
  nowSec: number;
  receiptRecipient: Address;
  confirmDnsBeforeParse?: boolean;
}): Promise<{ offers: CommerceOfferV1[]; sourceErrors: CommerceDiscoverySourceErrorV1[] }> {
  const offers: CommerceOfferV1[] = [];
  const sourceErrors: CommerceDiscoverySourceErrorV1[] = [];
  for (const source of input.sources) {
    try {
      const response = await fetchValidated(source, input.dnsResolver, input.fetcher);
      if (response.status !== 200) throw new Error(`Commerce source returned HTTP ${response.status}`);
      if (!response.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        throw new Error("Commerce source returned unsupported content type");
      }
      if (input.confirmDnsBeforeParse) {
        assertPublicCommerceUrlV1(source.url, await input.dnsResolver(new URL(source.url).hostname));
      }
      offers.push(...normalizeBazaar(source, response, input.nowSec, input.receiptRecipient));
    } catch (error) {
      sourceErrors.push({
        sourceId: source.id,
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const unique = new Map(offers.map((offer) => [canonicalJson(offer), offer]));
  return { offers: [...unique.values()], sourceErrors };
}
