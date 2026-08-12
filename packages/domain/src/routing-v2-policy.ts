import { isAddressEqual, type Address } from "viem";
import { z } from "zod";
import {
  AddressSchema,
  BasisPointsSchema,
  PositiveAtomicAmountSchema,
} from "./primitives";
import { MAX_SNAPSHOT_AGE_SECONDS } from "./policy";

export const MAX_ROUTE_SLIPPAGE_BPS = 500;
export const MAX_ROUTE_HORIZON_DAYS = 365;
export const MAX_ALLOWED_ROUTE_ASSETS = 8;
export const MAX_ALLOWED_ROUTE_ADAPTERS = 8;

export const ROUTE_ADAPTER_IDS = [
  "aave-v3@1",
  "curve-stableswap-ng@1",
  "uniswap-v3@1",
] as const;
export const AdapterIdSchema = z.enum(ROUTE_ADAPTER_IDS);
export type AdapterId = z.infer<typeof AdapterIdSchema>;

function isSortedUnique(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1] < value,
  );
}

export const RouteAddressV2Schema = AddressSchema.transform(
  (value) => value.toLowerCase() as Address,
);

export const RouteObjectiveV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("earn") }).strict(),
  z.object({
    kind: z.literal("swap"),
    outputAsset: RouteAddressV2Schema,
    minimumOutputAtomic: PositiveAtomicAmountSchema,
  }).strict(),
  z.object({
    kind: z.literal("profit"),
    minimumFinalAtomic: PositiveAtomicAmountSchema,
  }).strict(),
]);
export type RouteObjectiveV2 = z.infer<typeof RouteObjectiveV2Schema>;

export const StablecoinPolicyV2Schema = z
  .object({
    version: z.literal(2),
    requestId: z.string().uuid(),
    owner: RouteAddressV2Schema,
    executionChainId: z.literal(196),
    asset: RouteAddressV2Schema,
    principalAtomic: PositiveAtomicAmountSchema,
    protocolExposureBps: BasisPointsSchema.min(1),
    minTvlUsdE6: z.string().regex(/^(0|[1-9][0-9]*)$/),
    minPreGasApyBps: z.number().int().min(0),
    maxSnapshotAgeSec: z.number().int().positive().max(MAX_SNAPSHOT_AGE_SECONDS),
    deadline: z.number().int().positive(),
    noBridges: z.literal(true),
    allowedOutputAssets: z
      .array(RouteAddressV2Schema)
      .min(1)
      .max(MAX_ALLOWED_ROUTE_ASSETS),
    allowedAdapters: z
      .array(AdapterIdSchema)
      .min(1)
      .max(MAX_ALLOWED_ROUTE_ADAPTERS),
    maxSlippageBps: BasisPointsSchema.max(MAX_ROUTE_SLIPPAGE_BPS),
    horizonDays: z.number().int().min(1).max(MAX_ROUTE_HORIZON_DAYS),
    objective: RouteObjectiveV2Schema.optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!isSortedUnique(policy.allowedOutputAssets)) {
      context.addIssue({
        code: "custom",
        path: ["allowedOutputAssets"],
        message: "Authorized output assets must be sorted and unique",
      });
    }
    if (!policy.allowedOutputAssets.some((asset) => isAddressEqual(asset, policy.asset))) {
      context.addIssue({
        code: "custom",
        path: ["allowedOutputAssets"],
        message: "The input asset must also be an authorized supply output",
      });
    }
    if (!isSortedUnique(policy.allowedAdapters)) {
      context.addIssue({
        code: "custom",
        path: ["allowedAdapters"],
        message: "Authorized adapters must be sorted and unique",
      });
    }
    const objective = policy.objective;
    if (!objective || objective.kind === "earn") return;
    if (policy.protocolExposureBps !== 10_000) {
      context.addIssue({
        code: "custom",
        path: ["protocolExposureBps"],
        message: "Atomic Swap and Profit intents must route the full principal",
      });
    }
    if (policy.minPreGasApyBps !== 0) {
      context.addIssue({
        code: "custom",
        path: ["minPreGasApyBps"],
        message: "Atomic Swap and Profit intents do not use an APY threshold",
      });
    }
    if (objective.kind === "swap") {
      if (isAddressEqual(objective.outputAsset, policy.asset)) {
        context.addIssue({
          code: "custom",
          path: ["objective", "outputAsset"],
          message: "A Swap objective must change assets",
        });
      }
      if (!policy.allowedOutputAssets.some((asset) =>
        isAddressEqual(asset, objective.outputAsset))) {
        context.addIssue({
          code: "custom",
          path: ["objective", "outputAsset"],
          message: "The Swap output must be an authorized asset",
        });
      }
    }
    if (objective.kind === "profit" &&
      BigInt(objective.minimumFinalAtomic) <= BigInt(policy.principalAtomic)) {
      context.addIssue({
        code: "custom",
        path: ["objective", "minimumFinalAtomic"],
        message: "A Profit objective must require more of the input asset",
      });
    }
  });

export type StablecoinPolicyV2 = z.infer<typeof StablecoinPolicyV2Schema>;

export function routeObjectiveV2(
  policy: StablecoinPolicyV2,
): RouteObjectiveV2 {
  return policy.objective ?? { kind: "earn" };
}

export function parseStablecoinPolicyV2(
  input: unknown,
  nowSec: number,
): StablecoinPolicyV2 {
  const policy = StablecoinPolicyV2Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Policy deadline must be in the future");
  return policy;
}
