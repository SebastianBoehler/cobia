import { isHash, type Hash, type Hex } from "viem";
import type { OwnerTransactionV2 } from "./types";

export function parseWalletQuantityV2(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} returned a malformed hex quantity`);
  }
  return BigInt(value);
}

export function parseWalletHashV2(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) {
    throw new Error("Wallet returned a malformed transaction hash");
  }
  return value;
}

export function walletTransactionV2(transaction: OwnerTransactionV2) {
  return {
    from: transaction.from,
    to: transaction.to,
    value: "0x0" as Hex,
    data: transaction.data,
  } as const;
}
