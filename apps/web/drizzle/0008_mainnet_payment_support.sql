ALTER TABLE "cobia_payments" DROP CONSTRAINT "cobia_payments_support_check";--> statement-breakpoint
ALTER TABLE "cobia_payments" ADD CONSTRAINT "cobia_payments_support_check" CHECK (
      (("cobia_payments"."payment_chain_id" = 196
          AND lower("cobia_payments"."currency") = '0x779ded0c9e1022225f8e0630b35a9b54be713736')
        OR ("cobia_payments"."payment_chain_id" = 1952
          AND lower("cobia_payments"."currency") = '0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c'))
      AND "cobia_payments"."execution_chain_id" = 196
      AND "cobia_payments"."decimals" = 6 AND "cobia_payments"."amount_atomic" = '100000'
      AND "cobia_payments"."fee_payer" = true
    );
