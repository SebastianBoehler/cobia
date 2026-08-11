import { z } from "zod";
import {
  AtomicAmountSchema,
  HashSchema,
  PositiveAtomicAmountSchema,
  TimestampSchema,
} from "./primitives";
import {
  AdapterIdSchema,
  MAX_ALLOWED_ROUTE_ASSETS,
  MAX_ALLOWED_ROUTE_ADAPTERS,
  RouteAddressV2Schema,
} from "./routing-v2-policy";

const OpportunityBaseSchema = z.object({
  id: z.string().min(1).max(128),
});

export const AaveV3SupplyOpportunityV2Schema = OpportunityBaseSchema.extend({
  kind: z.literal("aave-v3-supply"),
  adapterId: z.literal("aave-v3@1"),
  asset: RouteAddressV2Schema,
  supplyRateBps: z.number().int().min(0),
  tvlUsdE6: AtomicAmountSchema,
  availableLiquidityAtomic: AtomicAmountSchema,
  validatedSupplyAtomic: PositiveAtomicAmountSchema,
}).strict();

export const UniswapV3ExactInputOpportunityV2Schema = OpportunityBaseSchema.extend({
  kind: z.literal("uniswap-v3-exact-input"),
  adapterId: z.literal("uniswap-v3@1"),
  tokenIn: RouteAddressV2Schema,
  tokenOut: RouteAddressV2Schema,
  feeTier: z.number().int().min(1).max(1_000_000),
  quotedInputAtomic: PositiveAtomicAmountSchema,
  quotedOutputAtomic: PositiveAtomicAmountSchema,
  estimatedGas: AtomicAmountSchema,
}).strict();

export const UniswapV3FullRangeLpOpportunityV2Schema = OpportunityBaseSchema.extend({
  kind: z.literal("uniswap-v3-full-range-lp"),
  adapterId: z.literal("uniswap-v3@1"),
  pool: RouteAddressV2Schema,
  token0: RouteAddressV2Schema,
  token1: RouteAddressV2Schema,
  feeTier: z.number().int().min(1).max(1_000_000),
  tickLower: z.number().int().min(-887272).max(887272),
  tickUpper: z.number().int().min(-887272).max(887272),
  historicalFeeApyBps: z.number().int().min(0),
  tvlUsdE6: AtomicAmountSchema,
  lookbackSeconds: z.number().int().positive().max(7 * 86_400),
  validatedInputAsset: RouteAddressV2Schema,
  validatedInputAtomic: PositiveAtomicAmountSchema,
  balanceSwapInputAtomic: PositiveAtomicAmountSchema,
  quotedSwapOutputAtomic: PositiveAtomicAmountSchema,
  amount0DesiredAtomic: PositiveAtomicAmountSchema,
  amount1DesiredAtomic: PositiveAtomicAmountSchema,
  quotedLiquidity: PositiveAtomicAmountSchema,
  minimumLiquidity: PositiveAtomicAmountSchema,
}).strict().superRefine((opportunity, context) => {
  if (opportunity.token0 === opportunity.token1) {
    context.addIssue({
      code: "custom",
      path: ["token1"],
      message: "An LP opportunity must contain two different assets",
    });
  }
  if (opportunity.tickLower >= opportunity.tickUpper) {
    context.addIssue({
      code: "custom",
      path: ["tickUpper"],
      message: "LP tick bounds must be ordered",
    });
  }
  const inputIsToken0 = opportunity.validatedInputAsset === opportunity.token0;
  const inputIsToken1 = opportunity.validatedInputAsset === opportunity.token1;
  if (!inputIsToken0 && !inputIsToken1) {
    context.addIssue({
      code: "custom",
      path: ["validatedInputAsset"],
      message: "LP input must be one of the pool assets",
    });
    return;
  }
  const retainedInput = BigInt(inputIsToken0
    ? opportunity.amount0DesiredAtomic
    : opportunity.amount1DesiredAtomic);
  const desiredOutput = inputIsToken0
    ? opportunity.amount1DesiredAtomic
    : opportunity.amount0DesiredAtomic;
  if (
    BigInt(opportunity.balanceSwapInputAtomic) + retainedInput !==
      BigInt(opportunity.validatedInputAtomic)
  ) {
    context.addIssue({
      code: "custom",
      path: ["balanceSwapInputAtomic"],
      message: "LP balance swap and retained input must conserve the validated amount",
    });
  }
  if (desiredOutput !== opportunity.quotedSwapOutputAtomic) {
    context.addIssue({
      code: "custom",
      path: [inputIsToken0 ? "amount1DesiredAtomic" : "amount0DesiredAtomic"],
      message: "LP output amount must equal the committed balance-swap quote",
    });
  }
  if (BigInt(opportunity.minimumLiquidity) > BigInt(opportunity.quotedLiquidity)) {
    context.addIssue({
      code: "custom",
      path: ["minimumLiquidity"],
      message: "LP minimum liquidity cannot exceed quoted liquidity",
    });
  }
});

export const RouteOpportunityV2Schema = z.discriminatedUnion("kind", [
  AaveV3SupplyOpportunityV2Schema,
  UniswapV3ExactInputOpportunityV2Schema,
  UniswapV3FullRangeLpOpportunityV2Schema,
]);

export const AssetValuationV2Schema = z
  .object({
    asset: RouteAddressV2Schema,
    decimals: z.number().int().min(0).max(255),
    priceUsdE8: PositiveAtomicAmountSchema,
  })
  .strict();

export const RouteSnapshotV2Schema = z
  .object({
    version: z.literal(2),
    requestId: z.string().uuid(),
    chainId: z.literal(196),
    blockNumber: PositiveAtomicAmountSchema,
    blockHash: HashSchema,
    capturedAt: TimestampSchema,
    adapterRegistryHash: HashSchema,
    scannedAdapters: z
      .array(AdapterIdSchema)
      .min(1)
      .max(MAX_ALLOWED_ROUTE_ADAPTERS),
    valuations: z
      .array(AssetValuationV2Schema)
      .max(MAX_ALLOWED_ROUTE_ASSETS),
    opportunities: z.array(RouteOpportunityV2Schema).max(64),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const ids = snapshot.opportunities.map((opportunity) => opportunity.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["opportunities"],
        message: "Opportunity IDs must be unique within a snapshot",
      });
    }
    if (
      snapshot.opportunities.some(
        (opportunity) => !snapshot.scannedAdapters.includes(opportunity.adapterId),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["opportunities"],
        message: "Every opportunity must come from a completed adapter scan",
      });
    }
    if (
      snapshot.scannedAdapters.some(
        (adapter, index) => index > 0 && snapshot.scannedAdapters[index - 1] >= adapter,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["scannedAdapters"],
        message: "Scanned adapters must be sorted and unique",
      });
    }
    const valuationAssets = snapshot.valuations.map(({ asset }) => asset);
    if (
      valuationAssets.some(
        (asset, index) => index > 0 && valuationAssets[index - 1] >= asset,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["valuations"],
        message: "Asset valuations must be sorted and unique",
      });
    }
    const valued = new Set(valuationAssets);
    if (snapshot.opportunities.some((opportunity) => {
      if (opportunity.kind === "aave-v3-supply") {
        return !valued.has(opportunity.asset);
      }
      if (opportunity.kind === "uniswap-v3-exact-input") {
        return !valued.has(opportunity.tokenIn) || !valued.has(opportunity.tokenOut);
      }
      return !valued.has(opportunity.token0) || !valued.has(opportunity.token1);
    })) {
      context.addIssue({
        code: "custom",
        path: ["valuations"],
        message: "Every opportunity asset must have a valuation",
      });
    }
  });

export type AssetValuationV2 = z.infer<typeof AssetValuationV2Schema>;
export type RouteOpportunityV2 = z.infer<typeof RouteOpportunityV2Schema>;
export type RouteSnapshotV2 = z.infer<typeof RouteSnapshotV2Schema>;
