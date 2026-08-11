import type { ExecutionAttempt } from "./execution-service-types";

function semanticLabel(value: Record<string, unknown>) {
  return typeof value.label === "string" ? value.label : undefined;
}

export function executionSessionView(
  attempt: ExecutionAttempt,
  token: string,
  tokenExpiresAt: number,
) {
  const steps = attempt.steps.map((step) => ({
    ordinal: step.ordinal,
    state: step.state,
    kind: step.kind,
    label: semanticLabel(step.semantic),
    to: step.to,
    gasEstimateAtomic: step.gasEstimateAtomic,
    transactionHash: step.transactionHash,
    receipt: step.receipt,
    evidence: step.evidence,
    postcondition: step.postcondition,
    failureCode: step.failureCode,
  }));
  const current = attempt.steps.findLast((step) => step.state === "prepared");
  const preparedStep = current ? {
    ordinal: current.ordinal,
    state: current.state,
    kind: current.kind,
    from: current.from,
    to: current.to,
    valueAtomic: current.valueAtomic,
    calldata: current.calldata,
    calldataHash: current.calldataHash,
    semantic: current.semantic,
    preBlockNumber: current.preBlockNumber,
    preBlockHash: current.preBlockHash,
    expectedNonce: current.expectedNonce,
    gasEstimateAtomic: current.gasEstimateAtomic,
  } : null;
  return {
    attempt: {
      id: attempt.id,
      routeId: attempt.routeId,
      buyer: attempt.buyer,
      executionChainId: attempt.executionChainId,
      state: attempt.state,
      nextOrdinal: attempt.nextOrdinal,
      failureCode: attempt.failureCode ?? null,
    },
    steps,
    preparedStep,
    token,
    tokenExpiresAt,
  };
}
