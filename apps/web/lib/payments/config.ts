import { getAddress, isAddress, isAddressEqual } from "viem";
import { z } from "zod";
import { PAYMENT_ASSET, PAYMENT_CHAIN_ID, PAYMENT_DECIMALS } from "./support";

const PaymentTermsEnvSchema = z.object({
  COBIA_TREASURY: z.string().transform((value) => getAddress(value)),
  PAYMENT_REALM: z.string().trim().min(1),
  PAYMENT_CHAIN_ID: z.string().optional()
    .refine((value) => value === undefined || value === `${PAYMENT_CHAIN_ID}`),
  PAYMENT_ASSET: z.string().optional().refine((value) =>
    value === undefined || (isAddress(value) && isAddressEqual(value, PAYMENT_ASSET))),
});

const PaymentEnvSchema = PaymentTermsEnvSchema.extend({
  MPPX_SECRET_KEY: z.string().min(32),
});

function parseConfig<T>(
  schema: z.ZodType<T>,
  source: Record<string, string | undefined>,
): T {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid payment configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readPaymentTermsConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = parseConfig(PaymentTermsEnvSchema, source);
  return {
    COBIA_TREASURY: parsed.COBIA_TREASURY,
    PAYMENT_REALM: parsed.PAYMENT_REALM,
    PAYMENT_CHAIN_ID,
    PAYMENT_ASSET,
    PAYMENT_DECIMALS,
  };
}

export function readPaymentConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = parseConfig(PaymentEnvSchema, source);
  return {
    ...readPaymentTermsConfig(source),
    MPPX_SECRET_KEY: parsed.MPPX_SECRET_KEY,
  };
}
