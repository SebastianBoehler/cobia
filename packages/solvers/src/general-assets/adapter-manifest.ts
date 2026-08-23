import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const CanonicalAddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
).transform((value) => value as Address);
const NonZeroHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).refine(
  (value) => !/^0x0{64}$/.test(value),
).transform((value) => value as Hash);
const AdapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128),
  version: z.number().int().positive().safe(),
}).strict();

export const RegisteredAdapterManifestV1Schema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    providerFamily: z.enum(["lifi", "okx", "semantic"]),
    adapter: AdapterSchema,
    chainId: z.union([z.literal(1), z.literal(196)]),
    target: CanonicalAddressSchema,
    runtimeCodeHash: NonZeroHashSchema,
    selectors: z.array(z.string().regex(/^0x[0-9a-f]{8}$/)).min(1).max(32),
    approvalSpenders: z.array(CanonicalAddressSchema).max(16),
  }).strict()).max(128),
}).strict().superRefine((manifest, context) => {
  const keys = manifest.entries.map(({ adapter, chainId, target }) =>
    `${adapter.id}@${adapter.version}:${chainId}:${target}`);
  if (!keys.every((key, index) => index === 0 || keys[index - 1]! < key)) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Manifest entries must be sorted and unique" });
  }
  manifest.entries.forEach((entry, index) => {
    const expectedFamily = entry.adapter.id.startsWith("lifi.") ? "lifi"
      : entry.adapter.id.startsWith("okx.") ? "okx"
        : entry.adapter.id.startsWith("semantic.") ? "semantic" : undefined;
    if (entry.providerFamily !== expectedFamily) {
      context.addIssue({ code: "custom", path: ["entries", index, "providerFamily"], message: "Unsupported adapter family" });
    }
    for (const field of ["selectors", "approvalSpenders"] as const) {
      if (!entry[field].every((value, item) => item === 0 || entry[field][item - 1]! < value)) {
        context.addIssue({ code: "custom", path: ["entries", index, field], message: `${field} must be sorted and unique` });
      }
    }
  });
});

export type RegisteredAdapterManifestV1 = z.infer<typeof RegisteredAdapterManifestV1Schema>;
export type RegisteredAdapterEntryV1 = RegisteredAdapterManifestV1["entries"][number];
