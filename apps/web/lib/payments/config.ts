import { getAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import { USDC_ADDRESS } from "../chain/xlayer";

const PaymentEnvSchema = z.object({
  MPPX_SECRET_KEY: z.string().min(32),
  COBIA_TREASURY: z.string().transform((value) => getAddress(value)),
  PAYMENT_CHAIN_ID: z.coerce.number().int().refine((value) => value === 196 || value === 1952),
  PAYMENT_ASSET: z.string().default(USDC_ADDRESS).transform((value) => getAddress(value)),
});

export function readPaymentConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = PaymentEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid payment configuration: ${invalid}`);
  }
  return parsed.data;
}

interface WinnerChargeInput {
  chainId: 196 | 1952;
  currency: Address;
  solver: Address;
  treasury: Address;
  quoteId: Hash;
}

export function buildWinnerCharge(input: WinnerChargeInput) {
  return {
    amount: "100000",
    currency: input.currency,
    recipient: input.solver,
    description: "Reveal Cobia verified yield route",
    externalId: input.quoteId,
    methodDetails: {
      chainId: input.chainId,
      feePayer: true,
      splits: [{ amount: "10000", recipient: input.treasury, memo: "cobia-platform" }],
    },
  };
}
