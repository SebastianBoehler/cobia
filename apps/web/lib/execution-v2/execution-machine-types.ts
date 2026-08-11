import type { Address } from "viem";
import type { VerifiedExecutionInputV2 } from "./execution-context";
import type {
  ConfirmedOwnerTransactionV2,
  ExecutionReadClientV2,
  ExecutionFailureV2,
  ExecutionResumeCheckpointV2,
  ExecutionWalletV2,
  SubmittedOwnerTransactionV2,
  SubmittedResumeResultV2,
} from "./engine-types";
import type { ReceiptPollWaitV2 } from "./receipt-validation";

export interface RouteExecutionMachineInputV2
  extends Omit<VerifiedExecutionInputV2, "nowSec"> {
  owner: Address;
  wallet: ExecutionWalletV2;
  readClient: ExecutionReadClientV2;
  nowSec: () => number;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}

export type MachineBatchResultV2 =
  | { kind: "complete"; confirmed: ConfirmedOwnerTransactionV2[] }
  | {
    kind: "pending";
    confirmed: ConfirmedOwnerTransactionV2[];
    submitted: SubmittedOwnerTransactionV2;
    resume: ExecutionResumeCheckpointV2;
  }
  | {
    kind: "failed";
    confirmed: ConfirmedOwnerTransactionV2[];
    submitted?: SubmittedOwnerTransactionV2;
    resume?: ExecutionResumeCheckpointV2;
    failure: ExecutionFailureV2;
  };

export type PostSwapAllowancesV2 = bigint | {
  token0Atomic: bigint;
  token1Atomic: bigint;
};

export interface RouteExecutionMachineV2 {
  executeInitial(currentAllowanceAtomic: bigint): Promise<MachineBatchResultV2>;
  executePostSwap(
    confirmedSwap: ConfirmedOwnerTransactionV2,
    currentAllowances: PostSwapAllowancesV2,
  ): Promise<MachineBatchResultV2>;
  resumeSubmitted(
    checkpoint: ExecutionResumeCheckpointV2,
  ): Promise<SubmittedResumeResultV2>;
}
