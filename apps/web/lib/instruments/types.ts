import { isAddress } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
  "Address must use lowercase canonical form",
);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const RwaInstrumentV1Schema = z.object({
  version: z.literal(1),
  chainId: z.union([z.literal(1), z.literal(196)]),
  token: AddressSchema,
  issuer: z.string().trim().min(1).max(160),
  underlyingIdentifier: z.string().trim().min(4).max(80),
  claimClass: z.enum(["beneficial-interest", "debt-claim", "fund-share"]),
  eligibleJurisdictions: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(64),
  restrictionsHash: HashSchema,
  runtimeCodeHash: HashSchema,
  implementationCodeHash: HashSchema,
  officialSources: z.array(z.object({
    url: z.string().url().refine((value) => new URL(value).protocol === "https:"),
    contentHash: HashSchema,
  }).strict()).min(1).max(16),
  evidenceExpiresAt: z.number().int().positive().safe(),
}).strict().superRefine((value, context) => {
  if (!sortedUnique(value.eligibleJurisdictions)) {
    context.addIssue({
      code: "custom",
      path: ["eligibleJurisdictions"],
      message: "Jurisdictions must be sorted and unique",
    });
  }
  const sources = value.officialSources.map(({ url }) => url);
  if (!sortedUnique(sources)) {
    context.addIssue({ code: "custom", path: ["officialSources"], message: "Sources must be sorted and unique" });
  }
});

export type RwaInstrumentV1 = z.infer<typeof RwaInstrumentV1Schema>;
