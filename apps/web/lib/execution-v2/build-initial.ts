import { encodeFunctionData } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { SWAP_ROUTER02_ABI } from "./abis";
import {
  aaveSupplyPostcondition,
  aaveSupplyTransaction,
  exactApprovalTransactions,
  parseExecutionContextV2,
  registeredExecutionAsset,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import {
  EXECUTION_CHAIN_ID,
  type OwnerTransactionBatchV2,
  type OwnerTransactionV2,
} from "./types";

export interface InitialRouteTransactionsInputV2 extends VerifiedExecutionInputV2 {
  currentAllowanceAtomic?: unknown;
}

export function buildInitialRouteTransactionsV2(
  input: InitialRouteTransactionsInputV2,
): OwnerTransactionBatchV2 {
  const { routePlan, owner, deadlineSec } = parseExecutionContextV2(input);
  const leg = routePlan.legs[0];
  if (!leg) return { transactions: [], postconditions: [] };
  const [first, second] = leg.actions;
  const amountInAtomic = BigInt(first.kind === "uniswap-v3-balance-swap"
    ? first.inputAtomic : leg.inputAtomic);

  if (first.kind === "aave-v3-supply") {
    const asset = registeredExecutionAsset(first.asset);
    return {
      transactions: [
        ...exactApprovalTransactions({
          asset,
          owner,
          currentAllowanceAtomic: input.currentAllowanceAtomic,
          requiredAmountAtomic: amountInAtomic,
          spenderKind: "aave",
        }),
        aaveSupplyTransaction(asset, owner, amountInAtomic),
      ],
      postconditions: [aaveSupplyPostcondition(asset, owner, amountInAtomic)],
    };
  }

  if (!second) throw new Error("Execution swap must be followed by a protocol action");
  const pair = registeredSwapPair(first.tokenIn, first.tokenOut);
  if (second.kind === "aave-v3-supply") registeredExecutionAsset(second.asset);
  const innerSwap = encodeFunctionData({
    abi: SWAP_ROUTER02_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: pair.input.address,
      tokenOut: pair.output.address,
      fee: pair.fee,
      recipient: owner,
      amountIn: amountInAtomic,
      amountOutMinimum: BigInt(first.minimumOutputAtomic),
      sqrtPriceLimitX96: 0n,
    }],
  });
  const swapTransaction: OwnerTransactionV2 = {
    label: "uniswap-v3-exact-input",
    chainId: EXECUTION_CHAIN_ID,
    from: owner,
    to: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
    value: 0n,
    data: encodeFunctionData({
      abi: SWAP_ROUTER02_ABI,
      functionName: "multicall",
      args: [BigInt(deadlineSec), [innerSwap]],
    }),
  };

  return {
    transactions: [
      ...exactApprovalTransactions({
        asset: pair.input,
        owner,
        currentAllowanceAtomic: input.currentAllowanceAtomic,
        requiredAmountAtomic: amountInAtomic,
        spenderKind: "uniswap",
      }),
      swapTransaction,
    ],
    postconditions: [{
      kind: "owner-output-balance-delta",
      owner,
      asset: pair.output.address,
      minimumDeltaAtomic: BigInt(first.minimumOutputAtomic),
      quotedDeltaAtomic: BigInt(first.quotedOutputAtomic),
    }],
  };
}
