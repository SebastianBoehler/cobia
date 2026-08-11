import type { ExecutionFailureV2 } from "./engine-types";

export class ExecutionStepErrorV2 extends Error {
  constructor(readonly code: ExecutionFailureV2["code"], message: string) {
    super(message);
    this.name = "ExecutionStepErrorV2";
  }
}

export function executionFailureV2(
  error: unknown,
  fallbackCode: ExecutionFailureV2["code"],
): ExecutionFailureV2 {
  if (error instanceof ExecutionStepErrorV2) {
    return { code: error.code, message: error.message };
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : "Unknown execution failure",
  };
}
