import { keccak256, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import {
  LifiQuoteEnvelopeV1Schema,
  LifiQuoteRequestV1Schema,
  LifiQuoteResponseV1Schema,
} from "./wire";

const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/).transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const HexSchema = z.string().regex(/^0x[0-9a-f]+$/).transform((value) => value as Hex);

export const NormalizedLifiQuoteV1Schema = z.object({
  version: z.literal(1),
  source: z.literal("lifi@1"),
  quoteId: z.string().min(1).max(256),
  responseHash: HashSchema,
  fetchedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
  fromChainId: z.union([z.literal(1), z.literal(196)]),
  toChainId: z.union([z.literal(1), z.literal(196)]),
  fromToken: AddressSchema,
  toToken: AddressSchema,
  fromAmount: z.string().regex(/^[1-9][0-9]*$/).max(78),
  toAmount: z.string().regex(/^[1-9][0-9]*$/).max(78),
  toAmountMin: z.string().regex(/^[1-9][0-9]*$/).max(78),
  slippageBps: z.number().int().min(1).max(5_000),
  fromAddress: AddressSchema,
  toAddress: AddressSchema,
  approvalAddress: AddressSchema,
  includedTools: z.array(z.string().min(1).max(64)).min(1).max(16),
  untrustedTransaction: z.object({
    chainId: z.union([z.literal(1), z.literal(196)]),
    from: AddressSchema,
    to: AddressSchema,
    selector: z.string().regex(/^0x[0-9a-f]{8}$/).transform((value) => value as Hex),
    data: HexSchema,
    dataHash: HashSchema,
    value: HexSchema,
    gasLimit: HexSchema.optional(),
  }).strict(),
}).strict();

export type NormalizedLifiQuoteV1 = z.infer<typeof NormalizedLifiQuoteV1Schema>;

function assertEqual(actual: unknown, expected: unknown, field: string): void {
  if (actual !== expected) throw new Error(`LI.FI response does not match request ${field}`);
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export function normalizeLifiQuoteV1(input: unknown): NormalizedLifiQuoteV1 {
  const envelope = LifiQuoteEnvelopeV1Schema.parse(input);
  const request = LifiQuoteRequestV1Schema.parse(envelope.request);
  const response = LifiQuoteResponseV1Schema.parse(envelope.response);
  if (envelope.expiresAt <= envelope.fetchedAt) throw new Error("LI.FI quote expiry must follow fetch time");

  assertEqual(response.action.fromChainId, request.fromChainId, "fromChainId");
  assertEqual(response.action.toChainId, request.toChainId, "toChainId");
  assertEqual(response.action.fromToken.chainId, request.fromChainId, "fromToken chain");
  assertEqual(response.action.toToken.chainId, request.toChainId, "toToken chain");
  assertEqual(response.action.fromToken.address, request.fromToken, "fromToken");
  assertEqual(response.action.toToken.address, request.toToken, "toToken");
  assertEqual(response.action.fromAmount, request.fromAmount, "fromAmount");
  assertEqual(response.estimate.fromAmount, request.fromAmount, "estimate fromAmount");
  assertEqual(response.action.fromAddress, request.fromAddress, "fromAddress");
  assertEqual(response.action.toAddress, request.toAddress, "toAddress");
  assertEqual(Math.round(response.action.slippage * 10_000), request.slippageBps, "slippage");
  assertEqual(response.transactionRequest.from, request.fromAddress, "transaction sender");
  assertEqual(response.transactionRequest.chainId, request.fromChainId, "transaction chain");
  assertEqual(response.estimate.tool, response.tool, "estimate tool");

  const tools = response.includedSteps.map(({ tool }) => tool);
  if (!sortedUnique(request.allowedTools) || !tools.every((tool) => request.allowedTools.includes(tool)) ||
      !request.allowedTools.includes(response.tool)) {
    throw new Error("LI.FI response contains a tool outside the request allowlist");
  }

  const data = response.transactionRequest.data;
  return NormalizedLifiQuoteV1Schema.parse({
    version: 1,
    source: "lifi@1",
    quoteId: response.id,
    responseHash: envelope.responseHash,
    fetchedAt: envelope.fetchedAt,
    expiresAt: envelope.expiresAt,
    fromChainId: request.fromChainId,
    toChainId: request.toChainId,
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromAmount: request.fromAmount,
    toAmount: response.estimate.toAmount,
    toAmountMin: response.estimate.toAmountMin,
    slippageBps: request.slippageBps,
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
    approvalAddress: response.estimate.approvalAddress,
    includedTools: tools,
    untrustedTransaction: {
      chainId: response.transactionRequest.chainId,
      from: response.transactionRequest.from,
      to: response.transactionRequest.to,
      selector: data.slice(0, 10),
      data,
      dataHash: keccak256(data),
      value: response.transactionRequest.value,
      gasLimit: response.transactionRequest.gasLimit,
    },
  });
}
