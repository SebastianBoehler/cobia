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

export const RouteOpportunityV2Schema = z.discriminatedUnion("kind", [
  AaveV3SupplyOpportunityV2Schema,
  UniswapV3ExactInputOpportunityV2Schema,
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
      return !valued.has(opportunity.tokenIn) || !valued.has(opportunity.tokenOut);
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
