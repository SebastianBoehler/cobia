import { z } from "zod";
import { DecisionBundleSchema } from "./bundle";
import { GeneralIntentPolicyV2Schema, GeneralIntentSnapshotV1Schema } from "./general-intent-policy";
import { HashSchema } from "./primitives";
import { StablecoinPolicySchema } from "./policy";
import { PersistedRouteQuoteV1Schema } from "./route-quote";
import { RouteBundleV2Schema, RouteQuoteV2Schema } from "./routing-v2-bundle";
import { StablecoinPolicyV2Schema } from "./routing-v2-policy";
import { RouteSnapshotV2Schema } from "./routing-v2-snapshot";
import { MarketSnapshotSchema } from "./snapshot";
import { VerificationVerdictSchema } from "./verdict";

export const PersistedStablecoinPolicySchema = z.discriminatedUnion("version", [
  StablecoinPolicySchema,
  StablecoinPolicyV2Schema,
]);

export const PersistedSnapshotSchema = z.discriminatedUnion("version", [
  MarketSnapshotSchema,
  RouteSnapshotV2Schema,
]);

export const PersistedIntentPolicySchema = z.union([
  PersistedStablecoinPolicySchema,
  GeneralIntentPolicyV2Schema,
]);

export const PersistedIntentSnapshotSchema = z.union([
  PersistedSnapshotSchema,
  GeneralIntentSnapshotV1Schema,
]);

export const PersistedBundleSchema = z.discriminatedUnion("version", [
  DecisionBundleSchema,
  RouteBundleV2Schema,
]);

export const PersistedRouteQuoteSchema = z.discriminatedUnion("version", [
  PersistedRouteQuoteV1Schema,
  RouteQuoteV2Schema,
]);

export const PersistedRouteVerificationVerdictV2Schema = z
  .object({
    bundleHash: HashSchema,
    routeAuthorized: z.boolean(),
    errorCodes: z.array(z.string()),
    recomputedPreGasApyBps: z.number().int().min(0),
  })
  .strict();

export const PersistedVerificationVerdictSchema = z.union([
  VerificationVerdictSchema,
  PersistedRouteVerificationVerdictV2Schema,
]);

export type PersistedStablecoinPolicy = z.infer<
  typeof PersistedStablecoinPolicySchema
>;
export type PersistedIntentPolicy = z.infer<typeof PersistedIntentPolicySchema>;
export type PersistedIntentSnapshot = z.infer<typeof PersistedIntentSnapshotSchema>;
export type PersistedSnapshot = z.infer<typeof PersistedSnapshotSchema>;
export type PersistedBundle = z.infer<typeof PersistedBundleSchema>;
export type PersistedRouteQuote = z.infer<typeof PersistedRouteQuoteSchema>;
export type PersistedVerificationVerdict = z.infer<
  typeof PersistedVerificationVerdictSchema
>;
