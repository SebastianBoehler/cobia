export const REFERENCE_TRANSACTION_VALIDITY_SEC = 120;

export function referenceTransactionExpiry(nowSec: number, deadline = Number.MAX_SAFE_INTEGER) {
  return Math.min(deadline, nowSec + REFERENCE_TRANSACTION_VALIDITY_SEC);
}
