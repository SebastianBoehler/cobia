import { isAddressEqual } from "viem";
import { z } from "zod";
import {
  AtomicAmountSchema,
  PositiveAtomicAmountSchema,
} from "./primitives";
import {
  MAX_ROUTE_HORIZON_DAYS,
  RouteAddressV2Schema,
} from "./routing-v2-policy";

export const MAX_ROUTE_LEGS = 1;

const OpportunityReferenceSchema = z.string().min(1).max(128);

export const AaveV3SupplyActionV2Schema = z
  .object({
    kind: z.literal("aave-v3-supply"),
    opportunityId: OpportunityReferenceSchema,
    consume: z.literal("all"),
    asset: RouteAddressV2Schema,
  })
  .strict();

export const UniswapV3ExactInputActionV2Schema = z
  .object({
    kind: z.literal("uniswap-v3-exact-input"),
    opportunityId: OpportunityReferenceSchema,
    consume: z.literal("all"),
    tokenIn: RouteAddressV2Schema,
    tokenOut: RouteAddressV2Schema,
    quotedOutputAtomic: PositiveAtomicAmountSchema,
    minimumOutputAtomic: PositiveAtomicAmountSchema,
  })
  .strict()
  .superRefine((action, context) => {
    if (BigInt(action.minimumOutputAtomic) > BigInt(action.quotedOutputAtomic)) {
      context.addIssue({
        code: "custom",
        path: ["minimumOutputAtomic"],
        message: "Minimum output cannot exceed quoted output",
      });
    }
    if (isAddressEqual(action.tokenIn, action.tokenOut)) {
      context.addIssue({
        code: "custom",
        path: ["tokenOut"],
        message: "A swap must change assets",
      });
    }
  });

const DirectSupplyActionsSchema = z.tuple([AaveV3SupplyActionV2Schema]);
const SwapThenSupplyActionsSchema = z.tuple([
  UniswapV3ExactInputActionV2Schema,
  AaveV3SupplyActionV2Schema,
]);

export const RouteLegV2Schema = z
  .object({
    id: z.string().min(1).max(64),
    inputAtomic: PositiveAtomicAmountSchema,
    actions: z.union([DirectSupplyActionsSchema, SwapThenSupplyActionsSchema]),
  })
  .strict();

export const RoutePlanV2Schema = z
  .object({
    version: z.literal(2),
    inputAsset: RouteAddressV2Schema,
    inputAtomic: PositiveAtomicAmountSchema,
    retainedAtomic: AtomicAmountSchema,
    horizonDays: z.number().int().min(1).max(MAX_ROUTE_HORIZON_DAYS),
    legs: z.array(RouteLegV2Schema).max(MAX_ROUTE_LEGS),
  })
  .strict()
  .superRefine((plan, context) => {
    const deployed = plan.legs.reduce(
      (total, leg) => total + BigInt(leg.inputAtomic),
      0n,
    );
    if (BigInt(plan.retainedAtomic) + deployed !== BigInt(plan.inputAtomic)) {
      context.addIssue({
        code: "custom",
        path: ["legs"],
        message: "Retained and deployed atomic amounts must conserve the input",
      });
    }
    plan.legs.forEach((leg, index) => {
      const [first, second] = leg.actions;
      if (first.kind === "aave-v3-supply") {
        if (!isAddressEqual(first.asset, plan.inputAsset)) {
          context.addIssue({
            code: "custom",
            path: ["legs", index, "actions", 0, "asset"],
            message: "Direct supply must consume the route input asset",
          });
        }
        return;
      }
      if (!second || !isAddressEqual(first.tokenIn, plan.inputAsset)) {
        context.addIssue({
          code: "custom",
          path: ["legs", index, "actions"],
          message: "Swap legs must consume the route input asset",
        });
      }
      if (second && !isAddressEqual(first.tokenOut, second.asset)) {
        context.addIssue({
          code: "custom",
          path: ["legs", index, "actions", 1, "asset"],
          message: "Supply must consume the complete swap output",
        });
      }
    });
  });

export type RouteLegV2 = z.infer<typeof RouteLegV2Schema>;
export type RoutePlanV2 = z.infer<typeof RoutePlanV2Schema>;
