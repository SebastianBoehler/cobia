import { commitment } from "@cobia/domain";
import { isAddress, isAddressEqual, type Address, type Hash } from "viem";
import { z } from "zod";
import type { CommerceFetchV1, DnsResolverV1 } from "./discovery-broker";
import { assertPublicCommerceUrlV1 } from "./network-policy";
import {
  finalizeX402PaymentV2,
  X402AuthorizationTemplateV1Schema,
} from "./x402-authorization";

const MAX_RESOURCE_BYTES = 1_048_576;
const MAX_SETTLEMENT_HEADER_BYTES = 12_288;
const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));

export const X402SettlementResponseV2Schema = z.object({
  success: z.literal(true), transaction: HashSchema, network: z.enum(["eip155:196", "eip155:8453"]),
  payer: AddressSchema, amount: z.string().regex(/^[1-9][0-9]*$/).max(78).optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
}).strict();

function parseSettlementHeader(value: string | undefined) {
  if (!value || value.length > Math.ceil(MAX_SETTLEMENT_HEADER_BYTES * 4 / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("x402 settlement header is missing or invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > MAX_SETTLEMENT_HEADER_BYTES || bytes.toString("base64") !== value) {
    throw new Error("x402 settlement header is missing or invalid");
  }
  let payload: unknown;
  try { payload = JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error("x402 settlement header is not valid JSON");
  }
  try { return X402SettlementResponseV2Schema.parse(payload); } catch {
    throw new Error("x402 settlement evidence does not match the supported response");
  }
}

export async function executeX402ResourceV1(input: {
  expected: unknown;
  submitted: unknown;
  signature: unknown;
  dnsResolver: DnsResolverV1;
  fetcher: CommerceFetchV1;
}) {
  const expected = X402AuthorizationTemplateV1Schema.parse(input.expected);
  const finalized = await finalizeX402PaymentV2(input);
  const hostname = new URL(expected.endpoint).hostname;
  const addresses = await input.dnsResolver(hostname);
  const endpoint = assertPublicCommerceUrlV1(expected.endpoint, addresses);
  const response = await input.fetcher({
    url: endpoint.toString(), resolvedAddress: addresses[0]!, timeoutMs: 10_000,
    maxBytes: MAX_RESOURCE_BYTES,
    headers: {
      accept: "application/json",
      "payment-signature": finalized.paymentSignature,
      "user-agent": "Cobia-Verified-Commerce/1",
    },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("x402 paid-resource redirect is forbidden");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`x402 paid resource returned HTTP ${response.status}`);
  }
  if (response.body.byteLength > MAX_RESOURCE_BYTES) {
    throw new Error("x402 paid resource response exceeds size limit");
  }
  if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
    throw new Error("x402 paid resource compression is forbidden");
  }
  const settlement = parseSettlementHeader(response.headers["payment-response"]);
  if (settlement.network !== expected.accepted.network ||
    !isAddressEqual(settlement.payer, expected.authorization.from) ||
    (settlement.amount !== undefined && settlement.amount !== expected.authorization.value)) {
    throw new Error("x402 settlement evidence does not match the authorization");
  }
  return {
    settlement,
    authorizationHash: commitment({
      templateHash: commitment(expected), signature: finalized.paymentPayload.payload.signature,
    }),
    resourceHash: commitment({ body: Buffer.from(response.body).toString("base64") }),
    resourceBody: response.body,
  };
}
