import { OKX_MAX_QUOTE_VALIDITY_SEC } from "@cobia/solvers";

export const REFERENCE_TRANSACTION_VALIDITY_SEC = OKX_MAX_QUOTE_VALIDITY_SEC;

export function referenceTransactionExpiry(nowSec: number, deadline = Number.MAX_SAFE_INTEGER) {
  return Math.min(deadline, nowSec + REFERENCE_TRANSACTION_VALIDITY_SEC);
}
