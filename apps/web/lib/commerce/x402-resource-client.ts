import { canonicalJson, commitment } from "@cobia/domain";
import { isAddress, isAddressEqual, type Address, type Hash } from "viem";
import { z } from "zod";
import type { CommerceFetchV1, DnsResolverV1 } from "./discovery-broker";
import { assertPublicCommerceUrlV1 } from "./network-policy";
import {
  finalizeX402PaymentV2,
  X402AuthorizationTemplateV1Schema,
} from "./x402-authorization";
import { parseX402PaymentRequiredWireV2 } from "./x402-wire";

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

function matchesAcceptedRequirement(
  fresh: ReturnType<typeof parseX402PaymentRequiredWireV2>["accepts"][number],
  expected: ReturnType<typeof X402AuthorizationTemplateV1Schema.parse>["accepted"],
) {
  return fresh.scheme === expected.scheme && fresh.network === expected.network &&
    fresh.amount === expected.amount && isAddressEqual(fresh.asset as Address, expected.asset) &&
    isAddressEqual(fresh.payTo as Address, expected.payTo) &&
    fresh.maxTimeoutSeconds === expected.maxTimeoutSeconds &&
    canonicalJson(fresh.extra ?? {}) === canonicalJson(expected.extra);
}

function paymentSignature(value: unknown) {
  return Buffer.from(canonicalJson(value), "utf8").toString("base64");
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
  const request = {
    url: endpoint.toString(), resolvedAddress: addresses[0]!, timeoutMs: 10_000,
    maxBytes: MAX_RESOURCE_BYTES,
  };
  const challengeResponse = await input.fetcher({
    ...request,
    headers: { accept: "application/json", "user-agent": "Cobia-Verified-Commerce/1" },
  });
  if (challengeResponse.status >= 300 && challengeResponse.status < 400) {
    throw new Error("x402 paid-resource redirect is forbidden");
  }
  if (challengeResponse.status !== 402) {
    throw new Error(`x402 fresh payment challenge returned HTTP ${challengeResponse.status}`);
  }
  const challenge = parseX402PaymentRequiredWireV2(
    challengeResponse.headers["payment-required"] ?? "",
  );
  const accepted = challenge.accepts.find((candidate) =>
    matchesAcceptedRequirement(candidate, expected.accepted));
  if (challenge.resource.url !== expected.endpoint || !accepted) {
    throw new Error("x402 fresh payment challenge does not match the authorized offer");
  }
  const signedPayload = {
    ...finalized.paymentPayload,
    resource: challenge.resource,
    accepted,
    extensions: challenge.extensions ?? {},
  };
  const response = await input.fetcher({
    ...request,
    headers: {
      accept: "application/json",
      "payment-signature": paymentSignature(signedPayload),
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
