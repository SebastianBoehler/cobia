import { commitment } from "@cobia/domain";
import { z } from "zod";
import { PAYMENT_CHAIN_ID } from "./support";

const HashSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash")
  .transform((value) => value.toLowerCase());

export const EvmPaymentReceiptSchema = z.object({
  method: z.literal("evm"),
  reference: HashSchema,
  status: z.literal("success"),
  timestamp: z.iso.datetime({ offset: true }),
  chainId: z.literal(PAYMENT_CHAIN_ID),
  challengeId: z.string().trim().min(1),
  externalId: HashSchema,
}).strict();

export type EvmPaymentReceipt = z.infer<typeof EvmPaymentReceiptSchema>;

export function parsePaymentReceiptHeader(header: string): EvmPaymentReceipt {
  if (!/^[A-Za-z0-9_-]+$/.test(header)) {
    throw new Error("Payment receipt header is not base64url encoded");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    throw new Error("Payment receipt header does not contain valid JSON");
  }
  return EvmPaymentReceiptSchema.parse(value);
}

export function hashPaymentReceiptHeader(header: string) {
  parsePaymentReceiptHeader(header);
  return commitment({ receipt: header });
}
