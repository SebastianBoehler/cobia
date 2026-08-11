import { encodeFunctionData, isAddressEqual } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from "./abis";
import {
  exactApprovalTransactions,
  parseAtomic,
  parseExecutionContextV2,
  registeredSwapPair,
  type VerifiedExecutionInputV2,
} from "./execution-context";
import { EXECUTION_CHAIN_ID, type OwnerTransactionBatchV2 } from "./types";

export interface PostSwapLiquidityTransactionsInputV2 extends VerifiedExecutionInputV2 {
  observedOutputBalanceDeltaAtomic: unknown;
  currentToken0AllowanceAtomic: unknown;
  currentToken1AllowanceAtomic: unknown;
}

export function buildPostSwapLiquidityTransactionsV2(
  input: PostSwapLiquidityTransactionsInputV2,
): OwnerTransactionBatchV2 {
  const { routePlan, owner, deadlineSec } = parseExecutionContextV2(input);
  const [swap, mint] = routePlan.legs[0]?.actions ?? [];
  if (swap?.kind !== "uniswap-v3-balance-swap" ||
    mint?.kind !== "uniswap-v3-full-range-mint") {
    throw new Error("Post-swap liquidity requires a balance-swap-then-mint plan");
  }
  const pair = registeredSwapPair(swap.tokenIn, swap.tokenOut);
  if (!isAddressEqual(mint.token0, PROTOCOL_REGISTRY.aaveV3.assets[
    PROTOCOL_REGISTRY.uniswapV3.pair.token0
  ].underlying.address) ||
    !isAddressEqual(mint.token1, PROTOCOL_REGISTRY.aaveV3.assets[
      PROTOCOL_REGISTRY.uniswapV3.pair.token1
    ].underlying.address) || mint.feeTier !== pair.fee) {
    throw new Error("LP mint does not match the registered pool");
  }
  const observed = parseAtomic(
    input.observedOutputBalanceDeltaAtomic,
    "Observed output balance delta",
  );
  if (observed < BigInt(swap.minimumOutputAtomic)) {
    throw new Error("Observed output balance delta is below the signed minimum");
  }
  const outputDesired = observed < BigInt(swap.quotedOutputAtomic)
    ? observed : BigInt(swap.quotedOutputAtomic);
  const outputIsToken0 = isAddressEqual(swap.tokenOut, mint.token0);
  const amount0Desired = outputIsToken0
    ? outputDesired : BigInt(mint.amount0DesiredAtomic);
  const amount1Desired = outputIsToken0
    ? BigInt(mint.amount1DesiredAtomic) : outputDesired;
  const token0 = isAddressEqual(pair.input.address, mint.token0) ? pair.input : pair.output;
  const token1 = isAddressEqual(pair.input.address, mint.token1) ? pair.input : pair.output;
  const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;

  return {
    transactions: [
      ...exactApprovalTransactions({
        asset: token0,
        owner,
        currentAllowanceAtomic: input.currentToken0AllowanceAtomic,
        requiredAmountAtomic: amount0Desired,
        spenderKind: "position-manager",
      }),
      ...exactApprovalTransactions({
        asset: token1,
        owner,
        currentAllowanceAtomic: input.currentToken1AllowanceAtomic,
        requiredAmountAtomic: amount1Desired,
        spenderKind: "position-manager",
      }),
      {
        label: "uniswap-v3-full-range-mint",
        chainId: EXECUTION_CHAIN_ID,
        from: owner,
        to: manager,
        value: 0n,
        data: encodeFunctionData({
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: "mint",
          args: [{
            token0: mint.token0,
            token1: mint.token1,
            fee: mint.feeTier,
            tickLower: mint.tickLower,
            tickUpper: mint.tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min: BigInt(mint.amount0MinAtomic),
            amount1Min: BigInt(mint.amount1MinAtomic),
            recipient: owner,
            deadline: BigInt(deadlineSec),
          }],
        }),
        minimumLiquidity: BigInt(mint.minimumLiquidity),
      },
    ],
    postconditions: [{
      kind: "uniswap-v3-full-range-mint",
      owner,
      token0: mint.token0,
      token1: mint.token1,
      amount0DesiredAtomic: amount0Desired,
      amount1DesiredAtomic: amount1Desired,
      amount0MinAtomic: BigInt(mint.amount0MinAtomic),
      amount1MinAtomic: BigInt(mint.amount1MinAtomic),
      minimumLiquidity: BigInt(mint.minimumLiquidity),
    }],
  };
}
