import { z } from "zod";
import { CompositionObjectiveV2Schema } from "../competitions/objective-measurement";

const InputSchema = z.object({
  receiptAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  receiptDecimals: z.number().int().min(0).max(255),
  receiptPriceUsdE8: z.string().regex(/^[1-9][0-9]*$/),
  supplyRateBps: z.number().int().min(0),
  horizonDays: z.number().int().min(1).max(365),
  expectedGas: z.number().int().min(21_000).max(20_000_000),
  gasPriceAtomic: z.string().regex(/^[1-9][0-9]*$/),
  nativePriceUsdE8: z.string().regex(/^[1-9][0-9]*$/),
  solverFeeAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  evidenceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
}).strict();

export function calculateCompositionNetYieldObjectiveV1(inputValue: unknown) {
  const input = InputSchema.parse(inputValue);
  const receiptUsdE8 = BigInt(input.receiptAtomic) * BigInt(input.receiptPriceUsdE8) /
    10n ** BigInt(input.receiptDecimals);
  const yieldUsdE8 = receiptUsdE8 * BigInt(input.supplyRateBps) *
    BigInt(input.horizonDays) / (365n * 10_000n);
  const gasUsdE8 = BigInt(input.expectedGas) * BigInt(input.gasPriceAtomic) *
    BigInt(input.nativePriceUsdE8) / 10n ** 18n;
  const feeUsdE8 = BigInt(input.solverFeeAtomic) * BigInt(input.nativePriceUsdE8) /
    10n ** 18n;
  const net = receiptUsdE8 + yieldUsdE8 - gasUsdE8 - feeUsdE8;
  return CompositionObjectiveV2Schema.parse({
    version: 2, kind: "composition-net-yield-usd-e8", direction: "maximize",
    atomic: (net > 0n ? net : 0n).toString(), horizonDays: input.horizonDays,
    evaluator: "composition-net-yield@1", evidenceHash: input.evidenceHash,
  });
}
