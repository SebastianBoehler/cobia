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

export const CurveStableSwapNgExactInputActionV2Schema = z
  .object({
    kind: z.literal("curve-stableswap-ng-exact-input"),
    opportunityId: OpportunityReferenceSchema,
    consume: z.literal("all"),
    pool: RouteAddressV2Schema,
    tokenIn: RouteAddressV2Schema,
    tokenOut: RouteAddressV2Schema,
    inputIndex: z.union([z.literal(0), z.literal(1)]),
    outputIndex: z.union([z.literal(0), z.literal(1)]),
    fee: PositiveAtomicAmountSchema,
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
    if (isAddressEqual(action.tokenIn, action.tokenOut) ||
      action.inputIndex === action.outputIndex) {
      context.addIssue({
        code: "custom",
        path: ["tokenOut"],
        message: "A Curve swap must change assets and pool indices",
      });
    }
  });

export const UniswapV3BalanceSwapActionV2Schema = z
  .object({
    kind: z.literal("uniswap-v3-balance-swap"),
    opportunityId: OpportunityReferenceSchema,
    inputAtomic: PositiveAtomicAmountSchema,
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
        message: "A balance swap must change assets",
      });
    }
  });

export const UniswapV3FullRangeMintActionV2Schema = z
  .object({
    kind: z.literal("uniswap-v3-full-range-mint"),
    opportunityId: OpportunityReferenceSchema,
    token0: RouteAddressV2Schema,
    token1: RouteAddressV2Schema,
    feeTier: z.number().int().min(1).max(1_000_000),
    tickLower: z.number().int().min(-887272).max(887272),
    tickUpper: z.number().int().min(-887272).max(887272),
    amount0DesiredAtomic: PositiveAtomicAmountSchema,
    amount1DesiredAtomic: PositiveAtomicAmountSchema,
    amount0MinAtomic: PositiveAtomicAmountSchema,
    amount1MinAtomic: PositiveAtomicAmountSchema,
    quotedLiquidity: PositiveAtomicAmountSchema,
    minimumLiquidity: PositiveAtomicAmountSchema,
  })
  .strict()
  .superRefine((action, context) => {
    if (isAddressEqual(action.token0, action.token1)) {
      context.addIssue({ code: "custom", path: ["token1"], message: "LP assets must differ" });
    }
    if (action.tickLower >= action.tickUpper) {
      context.addIssue({ code: "custom", path: ["tickUpper"], message: "LP ticks must be ordered" });
    }
    if (BigInt(action.amount0MinAtomic) > BigInt(action.amount0DesiredAtomic)) {
      context.addIssue({ code: "custom", path: ["amount0MinAtomic"], message: "Token0 minimum exceeds desired amount" });
    }
    if (BigInt(action.amount1MinAtomic) > BigInt(action.amount1DesiredAtomic)) {
      context.addIssue({ code: "custom", path: ["amount1MinAtomic"], message: "Token1 minimum exceeds desired amount" });
    }
    if (BigInt(action.minimumLiquidity) > BigInt(action.quotedLiquidity)) {
      context.addIssue({ code: "custom", path: ["minimumLiquidity"], message: "Minimum liquidity exceeds quote" });
    }
  });

const DirectSupplyActionsSchema = z.tuple([AaveV3SupplyActionV2Schema]);
const SwapThenSupplyActionsSchema = z.tuple([
  z.union([
    CurveStableSwapNgExactInputActionV2Schema,
    UniswapV3ExactInputActionV2Schema,
  ]),
  AaveV3SupplyActionV2Schema,
]);
const BalanceSwapThenMintActionsSchema = z.tuple([
  UniswapV3BalanceSwapActionV2Schema,
  UniswapV3FullRangeMintActionV2Schema,
]);

export const RouteLegV2Schema = z
  .object({
    id: z.string().min(1).max(64),
    inputAtomic: PositiveAtomicAmountSchema,
    actions: z.union([
      DirectSupplyActionsSchema,
      SwapThenSupplyActionsSchema,
      BalanceSwapThenMintActionsSchema,
    ]),
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
      if (first.kind === "uniswap-v3-balance-swap") {
        if (!second || second.kind !== "uniswap-v3-full-range-mint") {
          context.addIssue({
            code: "custom",
            path: ["legs", index, "actions"],
            message: "A balance swap must be followed by an LP mint",
          });
          return;
        }
        const inputIsToken0 = isAddressEqual(plan.inputAsset, second.token0);
        const inputIsToken1 = isAddressEqual(plan.inputAsset, second.token1);
        const outputMatches = inputIsToken0
          ? isAddressEqual(first.tokenOut, second.token1)
          : isAddressEqual(first.tokenOut, second.token0);
        const retainedInput = BigInt(inputIsToken0
          ? second.amount0DesiredAtomic
          : second.amount1DesiredAtomic);
        const desiredOutput = inputIsToken0
          ? second.amount1DesiredAtomic
          : second.amount0DesiredAtomic;
        if (
          !isAddressEqual(first.tokenIn, plan.inputAsset) ||
          (!inputIsToken0 && !inputIsToken1) ||
          !outputMatches ||
          first.opportunityId !== second.opportunityId ||
          BigInt(first.inputAtomic) + retainedInput !== BigInt(leg.inputAtomic) ||
          first.quotedOutputAtomic !== desiredOutput
        ) {
          context.addIssue({
            code: "custom",
            path: ["legs", index, "actions"],
            message: "LP actions must conserve and bind the one-sided input",
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
      if (second?.kind === "aave-v3-supply" &&
        !isAddressEqual(first.tokenOut, second.asset)) {
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
