import type {
  Abi,
  Address,
  Hash,
  Hex,
} from "viem";
import type { ProtocolReadClient } from "../adapters/read-client";
import type { ExecutionStepLabelV2, OwnerTransactionV2 } from "./types";

export interface ExecutionWalletV2 {
  request(request: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

export interface ExecutionLogV2 {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
}

export interface ExecutionReceiptV2 {
  transactionHash: Hash;
  status: "success" | "reverted";
  blockNumber: bigint;
  blockHash: Hash;
  transactionIndex: number;
  from: Address;
  to: Address | null;
  logs: readonly ExecutionLogV2[];
}

export interface ExecutionTransactionV2 {
  hash: Hash;
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
  nonce: number;
  blockNumber: bigint | null;
  blockHash: Hash | null;
  transactionIndex: number | null;
}

export interface ExecutionReadClientV2 extends ProtocolReadClient {
  getBlockNumber(): Promise<bigint>;
  getReceipt(hash: Hash): Promise<ExecutionReceiptV2 | undefined>;
  getTransaction(hash: Hash): Promise<ExecutionTransactionV2 | undefined>;
  estimateGas(request: {
    from: Address;
    to: Address;
    value: bigint;
    data: Hex;
    nonce: bigint;
  }): Promise<bigint>;
  getTransactionCount(address: Address): Promise<bigint>;
  getBalance(address: Address): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  getBlockTransactions(blockNumber: bigint): Promise<ExecutionTransactionV2[]>;
  readContract(request: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
}

export type CapturedExecutionStateV2 =
  | {
    kind: "allowance";
    token: Address;
    spender: Address;
    expectedAtomic: bigint;
    beforeAtomic: bigint;
  }
  | {
    kind: "swap";
    venue?: "uniswap-v3" | "curve-stableswap-ng";
    tokenIn: Address;
    tokenOut: Address;
    amountInAtomic: bigint;
    minimumOutputAtomic: bigint;
    beforeInputAtomic: bigint;
    beforeOutputAtomic: bigint;
  }
  | {
    kind: "aave-supply";
    asset: Address;
    aToken: Address;
    suppliedAtomic: bigint;
    beforeInputAtomic: bigint;
    scaledATokenBeforeAtomic: bigint;
    normalizedIncomeBeforeRay: bigint;
  }
  | {
    kind: "uniswap-lp-mint";
    token0: Address;
    token1: Address;
    feeTier: number;
    tickLower: number;
    tickUpper: number;
    amount0DesiredAtomic: bigint;
    amount1DesiredAtomic: bigint;
    amount0MinAtomic: bigint;
    amount1MinAtomic: bigint;
    minimumLiquidity: bigint;
    deadlineSec: bigint;
  };

export type ExecutionProtocolEvidenceV2 =
  | { kind: "approval"; owner: Address; spender: Address; amountAtomic: bigint }
  | {
    kind: "swap";
    venue?: "uniswap-v3" | "curve-stableswap-ng";
    sender: Address;
    recipient: Address;
    inputAtomic: bigint;
    outputAtomic: bigint;
  }
  | {
    kind: "aave-supply";
    suppliedAtomic: bigint;
    mintValueAtomic: bigint;
    mintBalanceIncreaseAtomic: bigint;
    mintIndexRay: bigint;
  }
  | {
    kind: "uniswap-lp-mint";
    tokenId: bigint;
    liquidity: bigint;
    amount0Atomic: bigint;
    amount1Atomic: bigint;
  };

export type ExecutionStateCheckV2 =
  | {
    kind: "allowance";
    token: Address;
    spender: Address;
    beforeAtomic: bigint;
    afterAtomic: bigint;
    expectedAtomic: bigint;
  }
  | {
    kind: "swap";
    venue?: "uniswap-v3" | "curve-stableswap-ng";
    tokenIn: Address;
    tokenOut: Address;
    inputSpentAtomic: bigint;
    outputDeltaAtomic: bigint;
    ownerOutputBalanceDeltaAtomic: bigint;
    minimumOutputAtomic: bigint;
  }
  | {
    kind: "aave-supply";
    asset: Address;
    aToken: Address;
    inputSpentAtomic: bigint;
    suppliedAtomic: bigint;
    scaledATokenDeltaAtomic: bigint;
    normalizedIncomeBeforeRay: bigint;
    normalizedIncomeAfterRay: bigint;
  }
  | {
    kind: "uniswap-lp-mint";
    tokenId: bigint;
    token0: Address;
    token1: Address;
    liquidity: bigint;
    amount0Atomic: bigint;
    amount1Atomic: bigint;
  };

export interface ConfirmedOwnerTransactionV2 {
  label: ExecutionStepLabelV2;
  hash: Hash;
  preBlockNumber: bigint;
  preBlockHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
  transactionIndex: number;
  status: "success";
  gasEstimate: bigint;
  protocolEvidence: ExecutionProtocolEvidenceV2;
  stateCheck: ExecutionStateCheckV2;
}

export interface SubmittedOwnerTransactionV2 {
  label: ExecutionStepLabelV2;
  hash: Hash;
  preBlockNumber: bigint;
  preBlockHash: Hash;
  gasEstimate: bigint;
}

export interface ExecutionResumeCheckpointV2 {
  readonly version: 1;
  readonly kind: "submitted-hash";
  readonly chainId: 196;
  readonly owner: Address;
  readonly bundleHash: Hash;
  readonly phase: "initial" | "post-swap";
  readonly authorizedAmountAtomic: bigint;
  readonly expectedNonce?: bigint;
  readonly transaction: OwnerTransactionV2;
  readonly submitted: SubmittedOwnerTransactionV2;
  readonly capturedState: CapturedExecutionStateV2;
}

export interface ExecutionFailureV2 {
  code:
    | "receipt-attribution"
    | "receipt-reorged"
    | "transaction-reverted"
    | "protocol-event-missing"
    | "state-postcondition"
    | "step-preflight";
  message: string;
}

interface RouteExecutionBaseV2 {
  chainId: 196;
  owner: Address;
  transactions: ConfirmedOwnerTransactionV2[];
}

export type RouteExecutionResultV2 =
  | (RouteExecutionBaseV2 & { status: "success" | "no-action" })
  | (RouteExecutionBaseV2 & {
    status: "pending";
    submitted: SubmittedOwnerTransactionV2;
    resume: ExecutionResumeCheckpointV2;
  })
  | (RouteExecutionBaseV2 & {
    status: "partial" | "failed";
    submitted?: SubmittedOwnerTransactionV2;
    resume?: ExecutionResumeCheckpointV2;
    failure: ExecutionFailureV2;
  });

export type SubmittedResumeResultV2 =
  | { status: "confirmed"; transaction: ConfirmedOwnerTransactionV2 }
  | { status: "pending"; submitted: SubmittedOwnerTransactionV2 }
  | { status: "failed"; submitted: SubmittedOwnerTransactionV2; failure: ExecutionFailureV2 };
