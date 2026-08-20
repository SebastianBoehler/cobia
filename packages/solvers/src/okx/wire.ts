import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const PositiveAtomicSchema = AtomicSchema.refine((value) => value !== "0");
const DecimalSchema = z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]{1,9})?$/);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const HexSchema = z.string().regex(/^0x(?:[0-9a-f]{2})+$/).transform((value) => value as Hex);

export const OkxSwapRequestV1Schema = z.object({
  chainIndex: z.literal("196"),
  amount: PositiveAtomicSchema,
  fromTokenAddress: AddressSchema,
  toTokenAddress: AddressSchema,
  slippagePercent: DecimalSchema,
  userWalletAddress: AddressSchema,
  swapReceiverAddress: AddressSchema,
  swapMode: z.literal("exactIn"),
  disableRFQ: z.literal(true),
  approveTransaction: z.literal(false),
}).strict();

const TokenSchema = z.object({
  tokenContractAddress: AddressSchema,
  isHoneyPot: z.literal(false),
  taxRate: z.literal("0"),
}).passthrough();

const SwapDataSchema = z.object({
  routerResult: z.object({
    chainIndex: z.literal("196"),
    swapMode: z.literal("exactIn"),
    fromTokenAmount: PositiveAtomicSchema,
    toTokenAmount: PositiveAtomicSchema,
    fromToken: TokenSchema,
    toToken: TokenSchema,
  }).passthrough(),
  tx: z.object({
    from: AddressSchema,
    to: AddressSchema,
    value: AtomicSchema,
    minReceiveAmount: PositiveAtomicSchema,
    slippagePercent: DecimalSchema,
    data: HexSchema,
    gas: PositiveAtomicSchema,
  }).passthrough(),
}).passthrough();

export const OkxSwapResponseV1Schema = z.object({
  code: z.literal("0"),
  data: z.array(SwapDataSchema).length(1),
  msg: z.string(),
}).passthrough();

export const OkxSwapArtifactV1Schema = z.object({
  version: z.literal(1),
  provider: z.literal("okx.dex@1"),
  stageId: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(96),
  fetchedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
  request: OkxSwapRequestV1Schema,
  response: OkxSwapResponseV1Schema,
  attributedData: HexSchema,
}).strict();

export const OkxVerifierManifestV1Schema = z.object({
  version: z.literal(1),
  chainId: z.literal(196),
  router: z.object({
    address: AddressSchema,
    runtimeCodeHash: HashSchema,
    selectors: z.array(z.string().regex(/^0x[0-9a-f]{8}$/)).min(1).max(32),
  }).strict(),
  approval: z.object({
    address: AddressSchema,
    runtimeCodeHash: HashSchema,
  }).strict(),
  builderDataSuffix: HexSchema,
}).strict();

export const OkxAnchorV1Schema = z.object({
  chainId: z.literal(196),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
}).strict();

export type OkxSwapArtifactV1 = z.infer<typeof OkxSwapArtifactV1Schema>;
export type OkxVerifierManifestV1 = z.infer<typeof OkxVerifierManifestV1Schema>;
export type OkxAnchorV1 = z.infer<typeof OkxAnchorV1Schema>;
