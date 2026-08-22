import { settleSolverSuccessFee } from "./settle-solver-success-fee";

export const SOLVER_SUCCESS_FEES_ENABLED = false;

export const WAIVED_SOLVER_SUCCESS_FEE = {
  amountAtomic: "0",
  state: "waived" as const,
};

export async function finalizeSolverSuccessFee(
  input: Parameters<typeof settleSolverSuccessFee>[0],
) {
  if (!SOLVER_SUCCESS_FEES_ENABLED) return { state: "waived" as const };
  return settleSolverSuccessFee(input);
}
