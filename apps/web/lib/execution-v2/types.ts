import type { Address, Hex } from "viem";

export const EXECUTION_CHAIN_ID = 196 as const;

export type ExecutionStepLabelV2 =
  | "reset-aave-allowance"
  | "approve-aave-exact"
  | "aave-v3-supply"
  | "reset-uniswap-allowance"
  | "approve-uniswap-exact"
  | "uniswap-v3-exact-input"
  | "reset-position-manager-allowance"
  | "approve-position-manager-exact"
  | "uniswap-v3-full-range-mint";

export interface OwnerTransactionV2 {
  label: ExecutionStepLabelV2;
  chainId: typeof EXECUTION_CHAIN_ID;
  from: Address;
  to: Address;
  value: 0n;
  data: Hex;
  /** Off-chain bound verified with the attributed receipt; never sent to the wallet. */
  minimumLiquidity?: bigint;
}

export type ExecutionPostconditionV2 =
  | {
    kind: "owner-output-balance-delta";
    owner: Address;
    asset: Address;
    minimumDeltaAtomic: bigint;
    quotedDeltaAtomic: bigint;
  }
  | {
    kind: "aave-v3-supply";
    owner: Address;
    asset: Address;
    aToken: Address;
    amountAtomic: bigint;
  }
  | {
    kind: "uniswap-v3-full-range-mint";
    owner: Address;
    token0: Address;
    token1: Address;
    amount0DesiredAtomic: bigint;
    amount1DesiredAtomic: bigint;
    amount0MinAtomic: bigint;
    amount1MinAtomic: bigint;
    minimumLiquidity: bigint;
  };

export interface OwnerTransactionBatchV2 {
  transactions: OwnerTransactionV2[];
  postconditions: ExecutionPostconditionV2[];
}
