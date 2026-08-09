import { isAddress, type Address, type Hex } from "viem";
import { z } from "zod";

export const AddressSchema = z
  .string()
  .refine(isAddress, { message: "Invalid EVM address" })
  .transform((value) => value as Address);

export const HashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex value")
  .transform((value) => value as Hex);

export const SignatureSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte signature")
  .transform((value) => value as Hex);

export const AtomicAmountSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "Atomic amounts must be unsigned integers");

export const PositiveAtomicAmountSchema = AtomicAmountSchema.refine(
  (value) => value !== "0",
  { message: "Atomic amount must be positive" },
);

export const BasisPointsSchema = z.number().int().min(0).max(10_000);
export const TimestampSchema = z.string().datetime({ offset: true });

export const HttpUrlSchema = z.string().url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "Evidence URL must use HTTP or HTTPS" },
);
