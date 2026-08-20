import { commitment } from "@cobia/domain";
import { isAddress, parseAbiItem, toFunctionSelector, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const SelectorSchema = z.string().regex(/^0x[0-9a-fA-F]{8}$/).transform(
  (value) => value.toLowerCase() as Hex,
).refine((value) => value !== "0x00000000");
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);
const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:");
export const ERC20_TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hash;

export const CommerceArgumentBindingV1Schema = z.enum([
  "orderCommitment", "receiptRecipient", "quantity", "paymentAsset",
  "paymentAmount", "paymentPayee", "payer",
]);

const DeploymentSchema = z.object({ address: AddressSchema, runtimeCodeHash: HashSchema }).strict();
const DirectPlacementSchema = z.object({
  kind: z.literal("direct-contract"),
  target: AddressSchema,
  runtimeCodeHash: HashSchema,
  implementation: DeploymentSchema.optional(),
  functionSignature: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*\([^)]*\)$/).max(500),
  selector: SelectorSchema,
  argumentBindings: z.array(CommerceArgumentBindingV1Schema).min(1).max(12),
  expectedGas: z.number().int().min(21_000).max(5_000_000),
}).strict().superRefine((placement, context) => {
  let item;
  try { item = parseAbiItem(`function ${placement.functionSignature}`); } catch {
    context.addIssue({ code: "custom", path: ["functionSignature"], message: "Function signature is invalid" });
    return;
  }
  if (item.type !== "function" || item.inputs.length !== placement.argumentBindings.length) {
    context.addIssue({ code: "custom", path: ["argumentBindings"], message: "Every ABI input requires one binding" });
  }
  if (toFunctionSelector(placement.functionSignature).toLowerCase() !== placement.selector) {
    context.addIssue({ code: "custom", path: ["selector"], message: "Selector does not match function signature" });
  }
});

const X402PlacementSchema = z.object({
  kind: z.literal("x402-exact"),
  endpoint: HttpsUrlSchema,
  facilitator: HttpsUrlSchema,
  assetTransferMethod: z.literal("eip3009"),
  token: z.object({
    runtimeCodeHash: HashSchema,
    eip712Name: z.string().min(1).max(128),
    eip712Version: z.string().min(1).max(32),
  }).strict(),
}).strict();

const ReceiptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event"), emitter: AddressSchema, runtimeCodeHash: HashSchema,
    topic0: HashSchema, ownerTopicIndex: z.number().int().min(1).max(3),
    orderCommitmentTopicIndex: z.number().int().min(1).max(3),
  }).strict().refine((value) => value.ownerTopicIndex !== value.orderCommitmentTopicIndex, {
    message: "Receipt topic bindings must be distinct",
  }),
  z.object({
    kind: z.literal("erc721"), contract: AddressSchema, runtimeCodeHash: HashSchema,
    tokenId: PositiveAtomicSchema,
  }).strict(),
  z.object({
    kind: z.literal("erc1155"), contract: AddressSchema, runtimeCodeHash: HashSchema,
    tokenId: PositiveAtomicSchema, minimumIncreaseAtomic: PositiveAtomicSchema,
  }).strict(),
  z.object({
    kind: z.literal("eip3009-transfer"),
    topic0: HashSchema.refine((value) => value === ERC20_TRANSFER_TOPIC0),
    fromTopicIndex: z.number().int().min(1).max(3),
    toTopicIndex: z.number().int().min(1).max(3),
  }).strict().refine((value) => value.fromTopicIndex !== value.toTopicIndex, {
    message: "Transfer topic bindings must be distinct",
  }),
]);

const EntrySchema = z.object({
  merchantId: z.string().trim().min(1).max(256),
  productCommitment: HashSchema,
  payee: AddressSchema,
  paymentAsset: AddressSchema,
  exactAtomicAmount: PositiveAtomicSchema,
  placement: z.union([DirectPlacementSchema, X402PlacementSchema]),
  receipt: ReceiptSchema,
}).strict().superRefine((entry, context) => {
  if (entry.placement.kind === "x402-exact" && entry.receipt.kind !== "eip3009-transfer") {
    context.addIssue({ code: "custom", path: ["receipt"], message: "x402 requires EIP-3009 settlement evidence" });
  }
  if (entry.placement.kind === "direct-contract" && entry.receipt.kind === "eip3009-transfer") {
    context.addIssue({ code: "custom", path: ["receipt"], message: "Direct orders require order receipt evidence" });
  }
});

export const CommerceMerchantManifestV1Schema = z.object({
  version: z.literal(1),
  chainId: z.union([z.literal(196), z.literal(8453)]),
  entries: z.array(EntrySchema).max(64),
  officialSources: z.array(HttpsUrlSchema).max(64),
}).strict().superRefine((manifest, context) => {
  const keys = manifest.entries.map((entry) => `${entry.merchantId}:${entry.productCommitment}`);
  if (!keys.every((key, index) => index === 0 || keys[index - 1]! < key)) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Manifest entries must be sorted and unique" });
  }
  if (!manifest.officialSources.every((url, index) => index === 0 || manifest.officialSources[index - 1]! < url)) {
    context.addIssue({ code: "custom", path: ["officialSources"], message: "Official sources must be sorted and unique" });
  }
});

export type CommerceMerchantManifestV1 = z.infer<typeof CommerceMerchantManifestV1Schema>;

export function commerceMerchantManifestCommitmentV1(input: CommerceMerchantManifestV1): Hash {
  return commitment(CommerceMerchantManifestV1Schema.parse(input)) as Hash;
}
