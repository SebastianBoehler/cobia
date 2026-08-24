import {
  AddressSchema,
  BasisPointsSchema,
  HashSchema,
  PositiveAtomicAmountSchema,
} from "./primitives";
import { NATIVE_ASSET_ADDRESS } from "./native-asset";
import { z } from "zod";

export const GeneralAssetChainIdSchema = z.union([z.literal(1), z.literal(196)]);
const CanonicalAddressSchema = AddressSchema.refine(
  (value) => value === value.toLowerCase(), "Addresses must use lowercase canonical form",
).refine((value) => !/^0x0{40}$/.test(value), "Token address cannot be zero");
const NonZeroHashSchema = HashSchema.refine(
  (value) => value === value.toLowerCase() && !/^0x0{64}$/.test(value),
  "Hash must be nonzero lowercase hex",
);
const TimestampSecSchema = z.number().int().positive().safe();
const AdapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128),
  version: z.number().int().positive().safe(),
}).strict();

export const ChainAssetIdentityV1Schema = z.object({
  chainId: GeneralAssetChainIdSchema,
  token: CanonicalAddressSchema,
}).strict();

const ProxyEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({
    kind: z.literal("eip1967"),
    implementation: CanonicalAddressSchema,
    implementationRuntimeCodeHash: NonZeroHashSchema,
    admin: CanonicalAddressSchema.nullable(),
  }).strict(),
  z.object({
    kind: z.literal("beacon"),
    beacon: CanonicalAddressSchema,
    beaconRuntimeCodeHash: NonZeroHashSchema,
    implementation: CanonicalAddressSchema,
    implementationRuntimeCodeHash: NonZeroHashSchema,
  }).strict(),
]);

const IdentityLifetimeShape = {
  version: z.literal(1),
  chainId: GeneralAssetChainIdSchema,
  blockNumber: PositiveAtomicAmountSchema,
  blockHash: NonZeroHashSchema,
  capturedAtSec: TimestampSecSchema,
  expiresAtSec: TimestampSecSchema,
};

function validLifetime(evidence: { capturedAtSec: number; expiresAtSec: number }, context: z.RefinementCtx) {
  if (evidence.expiresAtSec <= evidence.capturedAtSec) {
    context.addIssue({ code: "custom", path: ["expiresAtSec"], message: "Evidence expiry must follow capture" });
  }
}

export const Erc20AssetIdentityEvidenceV1Schema = z.object({
  ...IdentityLifetimeShape,
  token: CanonicalAddressSchema.refine((value) => value !== NATIVE_ASSET_ADDRESS,
    "Native gas requires native identity evidence"),
  runtimeCodeHash: NonZeroHashSchema,
  proxy: ProxyEvidenceSchema,
  decimals: z.number().int().min(0).max(36),
  behaviorModule: z.object({ id: z.literal("plain-erc20"), version: z.literal(1) }).strict(),
}).strict().superRefine(validLifetime);

export const NativeAssetIdentityEvidenceV1Schema = z.object({
  ...IdentityLifetimeShape,
  token: z.literal(NATIVE_ASSET_ADDRESS),
  decimals: z.literal(18),
  behaviorModule: z.object({ id: z.literal("native-gas"), version: z.literal(1) }).strict(),
}).strict().superRefine(validLifetime);

export const AssetIdentityEvidenceV1Schema = z.union([
  Erc20AssetIdentityEvidenceV1Schema,
  NativeAssetIdentityEvidenceV1Schema,
]);
export type Erc20AssetIdentityEvidenceV1 = z.infer<typeof Erc20AssetIdentityEvidenceV1Schema>;
export type NativeAssetIdentityEvidenceV1 = z.infer<typeof NativeAssetIdentityEvidenceV1Schema>;
export type AssetIdentityEvidenceV1 = z.infer<typeof AssetIdentityEvidenceV1Schema>;

export function stableAssetIdentityV1(evidence: AssetIdentityEvidenceV1) {
  const common = { version: evidence.version, chainId: evidence.chainId, token: evidence.token,
    decimals: evidence.decimals, behaviorModule: evidence.behaviorModule };
  return "runtimeCodeHash" in evidence
    ? { ...common, runtimeCodeHash: evidence.runtimeCodeHash, proxy: evidence.proxy }
    : common;
}

const ValuationQuoteV1Schema = z.object({
  adapter: AdapterSchema,
  outputAtomic: PositiveAtomicAmountSchema,
  referenceValueUsdE8: PositiveAtomicAmountSchema,
  liquidityUsdE8: PositiveAtomicAmountSchema,
  priceImpactBps: BasisPointsSchema,
  fetchedAtSec: TimestampSecSchema,
  expiresAtSec: TimestampSecSchema,
  quoteHash: NonZeroHashSchema,
}).strict().superRefine((quote, context) => {
  if (quote.expiresAtSec <= quote.fetchedAtSec) {
    context.addIssue({ code: "custom", path: ["expiresAtSec"], message: "Quote expiry must follow fetch" });
  }
});

export const AssetValuationEvidenceV1Schema = z.object({
  version: z.literal(1),
  assetIdentityHash: NonZeroHashSchema,
  referenceAsset: ChainAssetIdentityV1Schema,
  inputAtomic: PositiveAtomicAmountSchema,
  conservativeValueUsdE8: PositiveAtomicAmountSchema,
  maximumDisagreementBps: BasisPointsSchema.max(1_000),
  quotes: z.array(ValuationQuoteV1Schema).min(1).max(8),
  capturedAtSec: TimestampSecSchema,
  expiresAtSec: TimestampSecSchema,
}).strict().superRefine((evidence, context) => {
  if (evidence.expiresAtSec <= evidence.capturedAtSec) {
    context.addIssue({ code: "custom", path: ["expiresAtSec"], message: "Evidence expiry must follow capture" });
  }
  const keys = evidence.quotes.map(({ adapter }) => `${adapter.id}@${adapter.version}`);
  if (!keys.every((key, index) => index === 0 || keys[index - 1]! < key)) {
    context.addIssue({ code: "custom", path: ["quotes"], message: "Valuation quotes must be sorted and unique" });
  }
  evidence.quotes.forEach((quote, index) => {
    if (quote.fetchedAtSec > evidence.capturedAtSec || quote.expiresAtSec < evidence.expiresAtSec) {
      context.addIssue({ code: "custom", path: ["quotes", index], message: "Quote does not cover evidence lifetime" });
    }
  });
});
export type AssetValuationEvidenceV1 = z.infer<typeof AssetValuationEvidenceV1Schema>;

export function parseAssetIdentityEvidenceV1(input: unknown, nowSec: number): AssetIdentityEvidenceV1 {
  const evidence = AssetIdentityEvidenceV1Schema.parse(input);
  if (evidence.expiresAtSec <= nowSec) throw new Error("Asset identity evidence is expired");
  return evidence;
}

export function parseAssetValuationEvidenceV1(input: unknown, nowSec: number): AssetValuationEvidenceV1 {
  const evidence = AssetValuationEvidenceV1Schema.parse(input);
  if (evidence.expiresAtSec <= nowSec) throw new Error("Asset valuation evidence is expired");
  return evidence;
}
