export type ExecutionApiError = {
  code: string;
  message: string;
  status: number;
};

const knownErrors: Array<[string, ExecutionApiError]> = [
  ["no longer executable", {
    code: "ROUTE_STALE",
    message: "This purchased route has expired. Create and purchase a fresh quote.",
    status: 409,
  }],
  ["has expired", {
    code: "ROUTE_STALE",
    message: "This execution authorization has expired. Sign a fresh authorization.",
    status: 409,
  }],
  ["Passing execution rehearsal is unavailable", {
    code: "REHEARSAL_REQUIRED",
    message: "This exact route needs a passing mainnet-fork rehearsal before execution.",
    status: 409,
  }],
  ["balance is insufficient", {
    code: "INSUFFICIENT_FUNDS",
    message: "The connected wallet does not have enough route tokens or OKB gas.",
    status: 422,
  }],
  ["Purchased route is unavailable", {
    code: "ROUTE_NOT_FOUND",
    message: "The purchased route is unavailable for this wallet.",
    status: 404,
  }],
  ["does not belong", {
    code: "EXECUTION_FORBIDDEN",
    message: "This execution session does not belong to the purchased route.",
    status: 403,
  }],
  ["proof", {
    code: "EXECUTION_PROOF_REJECTED",
    message: "The mainnet execution authorization was rejected.",
    status: 403,
  }],
];

export function executionApiError(error: unknown): ExecutionApiError {
  const message = error instanceof Error ? error.message : "";
  const known = knownErrors.find(([fragment]) => message.includes(fragment));
  if (known) return known[1];
  return {
    code: "EXECUTION_UNAVAILABLE",
    message: "Guided mainnet execution is temporarily unavailable.",
    status: 503,
  };
}
