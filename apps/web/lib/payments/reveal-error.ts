export type PaidRevealErrorCode =
  | "INVALID_REVEAL_PROOF"
  | "PAYMENT_CONTEXT_CHANGED"
  | "PAYMENT_CREDENTIAL_REJECTED"
  | "PAYMENT_RECONCILIATION_REQUIRED"
  | "ROUTE_NO_LONGER_ELIGIBLE"
  | "REVEAL_REJECTED";

export class PaidRevealClientError extends Error {
  constructor(
    readonly code: PaidRevealErrorCode,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "PaidRevealClientError";
  }
}

export async function paidRevealStep<T>(
  code: Exclude<PaidRevealErrorCode, "REVEAL_REJECTED">,
  message: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaidRevealClientError) throw error;
    throw new PaidRevealClientError(code, message);
  }
}

export function paidRevealClientError(error: unknown): PaidRevealClientError {
  if (error instanceof PaidRevealClientError) return error;
  return new PaidRevealClientError(
    "REVEAL_REJECTED",
    "Paid reveal could not be completed. Retry from the request page.",
  );
}
