import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const SelectorSchema = z.string().regex(/^0x[0-9a-fA-F]{8}$/).transform(
  (value) => value.toLowerCase() as Hex,
);
const ChainSchema = z.union([z.literal(1), z.literal(196)]);

const DeploymentSchema = z.object({
  chainId: ChainSchema,
  address: AddressSchema,
  runtimeCodeHash: HashSchema,
  selectors: z.array(SelectorSchema).min(1).max(16),
  tools: z.array(z.string().min(1).max(64)).min(1).max(16),
}).strict();

const AssetSchema = z.object({
  chainId: ChainSchema,
  address: AddressSchema,
  runtimeCodeHash: HashSchema,
}).strict();

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function sortedIdentities(values: readonly { chainId: number; address: string }[]): boolean {
  return values.every((value, index) => index === 0 ||
    values[index - 1]!.chainId < value.chainId ||
    (values[index - 1]!.chainId === value.chainId && values[index - 1]!.address < value.address));
}

export const LifiVerifierManifestV1Schema = z.object({
  version: z.literal(1),
  deployments: z.array(DeploymentSchema).min(1).max(8),
  assets: z.array(AssetSchema).min(2).max(64),
}).strict().superRefine((manifest, context) => {
  if (!sortedIdentities(manifest.deployments)) {
    context.addIssue({ code: "custom", path: ["deployments"], message: "Deployments must be sorted and unique" });
  }
  if (!sortedIdentities(manifest.assets)) {
    context.addIssue({ code: "custom", path: ["assets"], message: "Assets must be sorted and unique" });
  }
  manifest.deployments.forEach((deployment, index) => {
    if (!sortedUnique(deployment.selectors) || !sortedUnique(deployment.tools)) {
      context.addIssue({ code: "custom", path: ["deployments", index], message: "Permissions must be sorted and unique" });
    }
  });
});

export type LifiVerifierManifestV1 = z.infer<typeof LifiVerifierManifestV1Schema>;
