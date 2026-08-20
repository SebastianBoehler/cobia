import { keccak256, type Hash } from "viem";
import { assertPublicCommerceUrlV1 } from "../commerce/network-policy";

const HOST = "li.quest";
const MAX_RESPONSE_BYTES = 2_097_152;
const PATH_KEYS = {
  "/v1/chains": [],
  "/v1/tokens": ["chains"],
  "/v1/tools": ["chains"],
  "/v1/connections": ["fromChain", "fromToken", "toChain", "toToken"],
  "/v1/quote": [
    "allowBridges", "allowExchanges", "denyBridges", "denyExchanges", "fromAddress",
    "fromAmount", "fromChain", "fromToken", "integrator", "order", "slippage",
    "toAddress", "toChain", "toToken",
  ],
  "/v1/status": ["bridge", "fromChain", "toChain", "txHash"],
} as const;

export type LifiPathV1 = keyof typeof PATH_KEYS;
export type LifiHttpResponseV1 = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
};
export type LifiFetchV1 = (request: {
  url: string;
  resolvedAddress: string;
  timeoutMs: number;
  maxBytes: number;
  headers: Readonly<Record<string, string>>;
}) => Promise<LifiHttpResponseV1>;

export interface LifiBrokerV1 {
  request(input: { path: LifiPathV1; query: Readonly<Record<string, string>> }): Promise<{
    value: unknown;
    responseHash: Hash;
    fetchedAt: number;
  }>;
}

function validateQuery(path: LifiPathV1, query: Readonly<Record<string, string>>): URLSearchParams {
  const allowed = new Set<string>(PATH_KEYS[path]);
  const entries = Object.entries(query).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, value] of entries) {
    if (!allowed.has(key)) throw new Error(`LI.FI query key ${key} is not allowed for ${path}`);
    if (!value || value.length > 256 || /[\u0000-\u001f]/.test(value) || /:\/\/[^/]*@/.test(value)) {
      throw new Error(`LI.FI query value ${key} is invalid`);
    }
  }
  return new URLSearchParams(entries);
}

function parseBoundedJson(body: Uint8Array): unknown {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(body).toString("utf8")); } catch {
    throw new Error("LI.FI returned invalid JSON");
  }
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 100_000 || depth > 20) throw new Error("LI.FI response exceeds shape limits");
    if (Array.isArray(item)) item.forEach((child) => visit(child, depth + 1));
    else if (item && typeof item === "object") Object.values(item).forEach((child) => visit(child, depth + 1));
  };
  visit(value, 0);
  return value;
}

export function createLifiBrokerV1(input: {
  fetcher: LifiFetchV1;
  dnsResolver(hostname: string): Promise<readonly string[]>;
  nowSec?: () => number;
}): LifiBrokerV1 {
  return {
    async request(request) {
      if (!(request.path in PATH_KEYS)) throw new Error("LI.FI path is not allowed");
      const query = validateQuery(request.path, request.query);
      const url = new URL(`https://${HOST}${request.path}`);
      url.search = query.toString();
      const addresses = await input.dnsResolver(HOST);
      assertPublicCommerceUrlV1(url.toString(), addresses);
      const response = await input.fetcher({
        url: url.toString(),
        resolvedAddress: addresses[0]!,
        timeoutMs: 10_000,
        maxBytes: MAX_RESPONSE_BYTES,
        headers: { accept: "application/json", "user-agent": "Cobia-LIFI-Broker/1" },
      });
      if (response.status !== 200) throw new Error(`LI.FI returned HTTP ${response.status}`);
      if (!response.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        throw new Error("LI.FI returned an unsupported content type");
      }
      if (response.body.byteLength > MAX_RESPONSE_BYTES) throw new Error("LI.FI response exceeds size limit");
      return {
        value: parseBoundedJson(response.body),
        responseHash: keccak256(response.body),
        fetchedAt: input.nowSec?.() ?? Math.floor(Date.now() / 1_000),
      };
    },
  };
}
