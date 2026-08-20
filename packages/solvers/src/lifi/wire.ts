import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const AtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);
const ChainSchema = z.union([z.literal(1), z.literal(196)]);
const HexQuantitySchema = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/).transform(
  (value) => value.toLowerCase() as Hex,
);
const CalldataSchema = z.string().regex(/^0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{2})*$/).max(131_074).transform(
  (value) => value.toLowerCase() as Hex,
);

const TokenSchema = z.object({
  address: AddressSchema,
  chainId: ChainSchema,
  symbol: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(255),
  name: z.string().min(1).max(256),
});

export const LifiQuoteRequestV1Schema = z.object({
  fromChainId: ChainSchema,
  toChainId: ChainSchema,
  fromToken: AddressSchema,
  toToken: AddressSchema,
  fromAmount: AtomicSchema,
  fromAddress: AddressSchema,
  toAddress: AddressSchema,
  slippageBps: z.number().int().min(1).max(5_000),
  allowedTools: z.array(z.string().min(1).max(64)).min(1).max(16),
}).strict();

export const LifiQuoteResponseV1Schema = z.object({
  id: z.string().min(1).max(256),
  type: z.literal("lifi"),
  tool: z.string().min(1).max(64),
  action: z.object({
    fromToken: TokenSchema,
    toToken: TokenSchema,
    fromAmount: AtomicSchema,
    fromChainId: ChainSchema,
    toChainId: ChainSchema,
    slippage: z.number().positive().max(0.5),
    fromAddress: AddressSchema,
    toAddress: AddressSchema,
  }),
  estimate: z.object({
    tool: z.string().min(1).max(64),
    approvalAddress: AddressSchema,
    fromAmount: AtomicSchema,
    toAmount: AtomicSchema,
    toAmountMin: AtomicSchema,
  }),
  includedSteps: z.array(z.object({
    type: z.string().min(1).max(64),
    tool: z.string().min(1).max(64),
  })).min(1).max(16),
  transactionRequest: z.object({
    from: AddressSchema,
    to: AddressSchema,
    chainId: ChainSchema,
    data: CalldataSchema,
    value: HexQuantitySchema,
    gasLimit: HexQuantitySchema.optional(),
    gasPrice: HexQuantitySchema.optional(),
  }),
});

export const LifiQuoteEnvelopeV1Schema = z.object({
  response: z.unknown(),
  request: LifiQuoteRequestV1Schema,
  responseHash: HashSchema,
  fetchedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
}).strict();

export type LifiQuoteRequestV1 = z.infer<typeof LifiQuoteRequestV1Schema>;
export type LifiQuoteEnvelopeV1 = z.infer<typeof LifiQuoteEnvelopeV1Schema>;
