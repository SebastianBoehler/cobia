import type { Address } from "viem";
import { z } from "zod";
import { INTENT_ASSETS, decimalToAtomic } from "./capability-templates";

export const COMPOSITION_CAPABILITY_IDS = [
  "aave-v3.supply",
  "curve-stableswap-ng.exact-input",
  "uniswap-v3.exact-input",
] as const;

export const CompositionModelDraftSchema = z.object({
  inputSymbol: z.enum(INTENT_ASSETS.map(({ symbol }) => symbol) as [string, ...string[]]),
  amount: z.string(),
  capabilityIds: z.array(z.enum(COMPOSITION_CAPABILITY_IDS)).min(1).max(3),
  maxConversionLossBps: z.number().int().min(0).max(500),
  deadlineMinutes: z.number().int().min(1).max(30),
}).strict();
export type CompositionModelDraft = z.infer<typeof CompositionModelDraftSchema>;

export interface ComposedIntentDraft {
  kind: "composed";
  inputToken: Address;
  amount: string;
  capabilityIds: (typeof COMPOSITION_CAPABILITY_IDS)[number][];
  maxConversionLossBps: number;
  minimumReceiptValueBps: number;
  minimumReceiptSource: "conversion-loss" | "explicit";
  horizonDays: number;
  horizonSource: "product-default" | "explicit";
  competitionDurationSec: number;
  deadlineDurationSec: number;
}

export function resolveCompositionDraft(input: unknown): ComposedIntentDraft {
  const parsed = CompositionModelDraftSchema.parse(input);
  const asset = INTENT_ASSETS.find(({ symbol }) => symbol === parsed.inputSymbol);
  if (!asset || !decimalToAtomic(parsed.amount, asset.decimals)) {
    throw new Error("Composition input amount is invalid");
  }
  const capabilityIds = [...new Set(parsed.capabilityIds)].sort() as ComposedIntentDraft["capabilityIds"];
  if (!capabilityIds.includes("aave-v3.supply")) {
    throw new Error("Receipt-token composition requires the registered Aave capability");
  }
  return {
    kind: "composed",
    inputToken: asset.address,
    amount: parsed.amount,
    capabilityIds,
    maxConversionLossBps: parsed.maxConversionLossBps,
    minimumReceiptValueBps: 10_000 - parsed.maxConversionLossBps,
    minimumReceiptSource: "conversion-loss",
    horizonDays: 30,
    horizonSource: "product-default",
    competitionDurationSec: 300,
    deadlineDurationSec: parsed.deadlineMinutes * 60,
  };
}
