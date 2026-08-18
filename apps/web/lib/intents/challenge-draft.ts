import { isAddressEqual } from "viem";
import { z } from "zod";
import type { ChallengePolicyTemplateV1 } from "../db/challenge-schema";
import {
  DEFAULT_INTENT_RECEIPT_VALUES, INTENT_ASSETS, decimalToAtomic,
  type IntentReceiptValues,
} from "./capability-templates";

const DecimalSchema = z.string().refine((value) => decimalToAtomic(value, 6) !== null);
const AssetSchema = z.string().transform((value, context) => {
  const asset = INTENT_ASSETS.find(({ address }) => {
    try { return isAddressEqual(address, value as `0x${string}`); } catch { return false; }
  });
  if (!asset) {
    context.addIssue({ code: "custom", message: "Unsupported challenge asset" });
    return z.NEVER;
  }
  return asset.address;
});
const CommonSchema = {
  inputToken: AssetSchema,
  amount: DecimalSchema,
};
const TemplateSchema = z.discriminatedUnion("capabilityTemplateId", [
  z.object({
    version: z.literal(1), capabilityTemplateId: z.literal("aave-supply"),
    parameters: z.object(CommonSchema).strict(),
  }).strict(),
  z.object({
    version: z.literal(1), capabilityTemplateId: z.literal("exact-input-swap"),
    parameters: z.object({
      ...CommonSchema, outputToken: AssetSchema, minimum: DecimalSchema,
    }).strict(),
  }).strict(),
  z.object({
    version: z.literal(1), capabilityTemplateId: z.literal("round-trip"),
    parameters: z.object({ ...CommonSchema, minimum: DecimalSchema }).strict(),
  }).strict(),
]);

export interface IntentComposerDraft {
  goal: string;
  values: IntentReceiptValues;
}

export function challengeToIntentDraft(challenge: {
  displayGoal: string;
  policyTemplate: ChallengePolicyTemplateV1;
}): IntentComposerDraft {
  const parsed = TemplateSchema.safeParse(challenge.policyTemplate);
  if (!parsed.success) throw new Error("Challenge policy template is invalid");
  const { capabilityTemplateId: templateId, parameters } = parsed.data;
  return {
    goal: challenge.displayGoal,
    values: {
      ...DEFAULT_INTENT_RECEIPT_VALUES,
      ...parameters,
      templateId,
      outputToken: "outputToken" in parameters
        ? parameters.outputToken
        : DEFAULT_INTENT_RECEIPT_VALUES.outputToken,
      minimum: "minimum" in parameters
        ? parameters.minimum
        : DEFAULT_INTENT_RECEIPT_VALUES.minimum,
    },
  };
}
