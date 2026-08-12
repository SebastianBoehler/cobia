import { commitment, type RouteQuote } from "@cobia/domain";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  type Address,
  type Hash,
} from "viem";
import { z } from "zod";
import {
  LEGACY_PAYMENT_ASSET,
  LEGACY_PAYMENT_CHAIN_ID,
  PAYMENT_ASSET,
  PAYMENT_CHAIN_ID,
  PAYMENT_DECIMALS,
} from "./support";

const REVEAL_AMOUNT = "100000" as const;
const COBIA_SPLIT_AMOUNT = "10000" as const;
const COBIA_SPLIT_MEMO = "cobia-platform" as const;
const DESCRIPTION = "Reveal Cobia deterministic Aave quote";
export const MAX_PAYMENT_WINDOW_SECONDS = 300;
export const MAX_RFC3339_UNIX_SECONDS = 253_402_300_799;

const AddressSchema = z.string()
  .refine(isAddress, "Invalid EVM address")
  .transform((value) => getAddress(value));

function currencySchema(asset: Address) {
  return AddressSchema.refine(
    (value) => isAddressEqual(value, asset),
    "Unsupported payment asset",
  );
}

const HashSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte quote commitment")
  .transform((value) => value as Hash);

const PaymentSplitSchema = z.object({
  amount: z.literal(COBIA_SPLIT_AMOUNT),
  recipient: AddressSchema,
  memo: z.literal(COBIA_SPLIT_MEMO),
}).strict();

const PaymentTermsBaseSchema = z.object({
  realm: z.string().trim().min(1),
  decimals: z.literal(PAYMENT_DECIMALS),
  amount: z.literal(REVEAL_AMOUNT),
  recipient: AddressSchema,
  externalId: HashSchema,
  feePayer: z.literal(true),
  splits: z.tuple([PaymentSplitSchema]),
  issuedAt: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().positive().safe(),
}).strict();

const LegacyPaymentTermsSchema = PaymentTermsBaseSchema.extend({
  version: z.literal(1),
  paymentChainId: z.literal(LEGACY_PAYMENT_CHAIN_ID),
  currency: currencySchema(LEGACY_PAYMENT_ASSET),
}).strict();

const MainnetPaymentTermsSchema = PaymentTermsBaseSchema.extend({
  version: z.literal(2),
  paymentChainId: z.literal(PAYMENT_CHAIN_ID),
  currency: currencySchema(PAYMENT_ASSET),
}).strict();

export const PaymentTermsSchema = z.discriminatedUnion("version", [
  LegacyPaymentTermsSchema,
  MainnetPaymentTermsSchema,
]).superRefine((terms, context) => {
  if (terms.expiresAt <= terms.issuedAt) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Payment expiry must be after issuance",
    });
  }
  if (terms.expiresAt - terms.issuedAt > MAX_PAYMENT_WINDOW_SECONDS) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Payment window exceeds 300 seconds",
    });
  }
  if (terms.expiresAt > MAX_RFC3339_UNIX_SECONDS) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Payment expiry exceeds the RFC 3339 timestamp range",
    });
  }
});

export type PaymentTerms = z.infer<typeof PaymentTermsSchema>;
export type CurrentPaymentTerms = Extract<PaymentTerms, { version: 2 }>;

export function isCurrentPaymentTerms(value: unknown): value is CurrentPaymentTerms {
  const parsed = PaymentTermsSchema.safeParse(value);
  return parsed.success && parsed.data.version === 2;
}

interface BuildPaymentTermsInput {
  quote: Pick<RouteQuote, "quoteId" | "priceAtomic">;
  solver: Address;
  treasury: Address;
  realm: string;
  issuedAt: number;
  cutoff: number;
}

export function buildPaymentTerms(input: BuildPaymentTermsInput): PaymentTerms {
  return PaymentTermsSchema.parse({
    version: 2,
    realm: input.realm,
    paymentChainId: PAYMENT_CHAIN_ID,
    currency: PAYMENT_ASSET,
    decimals: PAYMENT_DECIMALS,
    amount: input.quote.priceAtomic,
    recipient: input.solver,
    externalId: input.quote.quoteId,
    feePayer: true,
    splits: [{
      amount: COBIA_SPLIT_AMOUNT,
      recipient: input.treasury,
      memo: COBIA_SPLIT_MEMO,
    }],
    issuedAt: input.issuedAt,
    expiresAt: input.cutoff,
  });
}

export function hashPaymentTerms(value: unknown): Hash {
  return commitment(PaymentTermsSchema.parse(value));
}

export function paymentTermsToChargeOptions(value: unknown) {
  const terms = PaymentTermsSchema.parse(value);
  return {
    amount: terms.amount,
    currency: terms.currency,
    recipient: terms.recipient,
    description: DESCRIPTION,
    externalId: terms.externalId,
    expires: new Date(terms.expiresAt * 1_000).toISOString(),
    methodDetails: {
      chainId: terms.paymentChainId,
      feePayer: terms.feePayer,
      splits: terms.splits.map((split) => ({ ...split })),
    },
  };
}
