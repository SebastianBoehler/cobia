import { encodeFunctionData } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { CURVE_STABLESWAP_NG_EXCHANGE_ABI, SWAP_ROUTER02_ABI } from "./abis";
import {
  exactApprovalTransactions,
  parseExecutionContextV2,
  registeredCurveSwap,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import { EXECUTION_CHAIN_ID, type OwnerTransactionBatchV2 } from "./types";

export interface PostSwapReturnInputV2 extends VerifiedExecutionInputV2 {
  observedOutputBalanceDeltaAtomic: bigint;
  currentAllowanceAtomic: bigint;
}

export function buildPostSwapReturnTransactionsV2(
  input: PostSwapReturnInputV2,
): OwnerTransactionBatchV2 {
  const { routePlan, owner, deadlineSec } = parseExecutionContextV2(input);
  const second = routePlan.legs[0]?.actions[1];
  if (!second || (second.kind !== "uniswap-v3-exact-input" &&
    second.kind !== "curve-stableswap-ng-exact-input") ||
    second.consume !== "exact" || !second.inputAtomic) {
    throw new Error("Profit execution requires an exact signed return swap");
  }
  const amountInAtomic = BigInt(second.inputAtomic);
  if (input.observedOutputBalanceDeltaAtomic < amountInAtomic) {
    throw new Error("Observed first swap output is below the signed return input");
  }

  if (second.kind === "curve-stableswap-ng-exact-input") {
    const pair = registeredCurveSwap(
      second.tokenIn, second.tokenOut, second.pool,
      second.inputIndex, second.outputIndex,
    );
    if (second.fee !== PROTOCOL_REGISTRY.curveStableSwapNg.pair.fee) {
      throw new Error("Curve execution fee does not match the registered pool");
    }
    return {
      transactions: [
        ...exactApprovalTransactions({
          asset: pair.input,
          owner,
          currentAllowanceAtomic: input.currentAllowanceAtomic,
          requiredAmountAtomic: amountInAtomic,
          spenderKind: "curve",
        }),
        {
          label: "curve-stableswap-ng-exact-input",
          chainId: EXECUTION_CHAIN_ID,
          from: owner,
          to: pair.pool,
          value: 0n,
          data: encodeFunctionData({
            abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
            functionName: "exchange",
            args: [
              BigInt(second.inputIndex), BigInt(second.outputIndex), amountInAtomic,
              BigInt(second.minimumOutputAtomic), owner,
            ],
          }),
        },
      ],
      postconditions: [{
        kind: "owner-output-balance-delta",
        owner,
        asset: pair.output.address,
        minimumDeltaAtomic: BigInt(second.minimumOutputAtomic),
        quotedDeltaAtomic: BigInt(second.quotedOutputAtomic),
      }],
    };
  }

  const pair = registeredSwapPair(second.tokenIn, second.tokenOut);
  const innerSwap = encodeFunctionData({
    abi: SWAP_ROUTER02_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: pair.input.address,
      tokenOut: pair.output.address,
      fee: pair.fee,
      recipient: owner,
      amountIn: amountInAtomic,
      amountOutMinimum: BigInt(second.minimumOutputAtomic),
      sqrtPriceLimitX96: 0n,
    }],
  });
  return {
    transactions: [
      ...exactApprovalTransactions({
        asset: pair.input,
        owner,
        currentAllowanceAtomic: input.currentAllowanceAtomic,
        requiredAmountAtomic: amountInAtomic,
        spenderKind: "uniswap",
      }),
      {
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
      },
    ],
    postconditions: [{
      kind: "owner-output-balance-delta",
      owner,
      asset: pair.output.address,
      minimumDeltaAtomic: BigInt(second.minimumOutputAtomic),
      quotedDeltaAtomic: BigInt(second.quotedOutputAtomic),
    }],
  };
}
