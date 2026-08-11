import {
  aaveSupplyPostcondition,
  aaveSupplyTransaction,
  exactApprovalTransactions,
  parseAtomic,
  parseExecutionContextV2,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import type { OwnerTransactionBatchV2 } from "./types";

export interface PostSwapSupplyTransactionsInputV2 extends VerifiedExecutionInputV2 {
  observedOutputBalanceDeltaAtomic: unknown;
  currentAllowanceAtomic: unknown;
}

export function buildPostSwapSupplyTransactionsV2(
  input: PostSwapSupplyTransactionsInputV2,
): OwnerTransactionBatchV2 {
  const { routePlan, owner } = parseExecutionContextV2(input);
  const leg = routePlan.legs[0];
  const [first, second] = leg?.actions ?? [];
  if (!leg || first?.kind !== "uniswap-v3-exact-input" || !second) {
    throw new Error("Post-swap supply requires a swap-then-supply plan");
  }
  const pair = registeredSwapPair(first.tokenIn, first.tokenOut);
  const observed = parseAtomic(
    input.observedOutputBalanceDeltaAtomic,
    "Observed output balance delta",
  );
  if (observed < BigInt(first.minimumOutputAtomic)) {
    throw new Error("Observed output balance delta is below the signed minimum");
  }
  const quoted = BigInt(first.quotedOutputAtomic);
  // Snapshot validation at the quoted amount is an upper bound for a smaller
  // supply; the staged engine still estimates each call against fresh state.
  const supplyAmount = observed < quoted ? observed : quoted;

  return {
    transactions: [
      ...exactApprovalTransactions({
        asset: pair.output,
        owner,
        currentAllowanceAtomic: input.currentAllowanceAtomic,
        requiredAmountAtomic: supplyAmount,
        spenderKind: "aave",
      }),
      aaveSupplyTransaction(pair.output, owner, supplyAmount),
    ],
    postconditions: [aaveSupplyPostcondition(pair.output, owner, supplyAmount)],
  };
}
