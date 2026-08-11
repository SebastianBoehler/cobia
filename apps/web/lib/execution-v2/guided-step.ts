import { isAddressEqual, type Hash } from "viem";
import {
  assertExecutionBlockHashV2,
  assertExecutionDeploymentsV2,
} from "./execution-deployments";
import {
  assertExecutionAuthorityV2,
  assertExecutionReadChainV2,
} from "./execution-authority";
import { parseExecutionContextV2, type VerifiedExecutionInputV2 } from "./execution-context";
import type {
  ExecutionReadClientV2,
  ExecutionResumeCheckpointV2,
  ExecutionTransactionV2,
  ExecutionWalletV2,
  SubmittedOwnerTransactionV2,
} from "./engine-types";
import type { GuidedPreparedStepV2 } from "./guided-session";
import { assertAuthorizedResumeCheckpointV2 } from "./resume-authorization";
import { EXECUTION_CHAIN_ID } from "./types";
import {
  parseWalletHashV2,
  parseWalletQuantityV2,
  walletTransactionV2,
} from "./wallet-rpc";

const ZERO_HASH = `0x${"0".repeat(64)}` as Hash;
const MAX_RECOVERY_BLOCKS = 64n;

interface SubmitGuidedStepInputV2 extends Omit<VerifiedExecutionInputV2, "nowSec"> {
  nowSec: () => number;
  readClient: ExecutionReadClientV2;
  wallet: ExecutionWalletV2;
  prepared: GuidedPreparedStepV2;
}

export interface GuidedSubmittedStepV2 extends SubmittedOwnerTransactionV2 {
  expectedNonce: bigint;
}

function authorizationCheckpoint(
  input: Omit<VerifiedExecutionInputV2, "nowSec">,
  prepared: GuidedPreparedStepV2,
): ExecutionResumeCheckpointV2 {
  const context = parseExecutionContextV2({ ...input, nowSec: 0 });
  return {
    version: 1,
    kind: "submitted-hash",
    chainId: EXECUTION_CHAIN_ID,
    owner: context.owner,
    bundleHash: input.verdict.bundleHash,
    phase: prepared.phase,
    authorizedAmountAtomic: prepared.authorizedAmountAtomic,
    expectedNonce: prepared.expectedNonce,
    transaction: prepared.transaction,
    submitted: {
      label: prepared.transaction.label,
      hash: ZERO_HASH,
      preBlockNumber: prepared.preBlockNumber,
      preBlockHash: prepared.preBlockHash,
      gasEstimate: prepared.gasEstimate,
    },
    capturedState: prepared.capturedState,
  };
}

export async function submitGuidedStepV2(
  input: SubmitGuidedStepInputV2,
): Promise<GuidedSubmittedStepV2> {
  const verified = { policy: input.policy, bundle: input.bundle, verdict: input.verdict };
  const context = parseExecutionContextV2({ ...verified, nowSec: input.nowSec() });
  assertAuthorizedResumeCheckpointV2(
    verified,
    authorizationCheckpoint(verified, input.prepared),
  );
  await assertExecutionAuthorityV2(input.wallet, input.readClient, context.owner);
  await assertExecutionBlockHashV2(
    input.readClient,
    input.prepared.preBlockNumber,
    input.prepared.preBlockHash,
  );
  const currentBlock = await input.readClient.getBlockNumber();
  const currentHash = await assertExecutionDeploymentsV2(
    input.readClient,
    input.prepared.transaction,
    currentBlock,
  );
  const rpcTransaction = walletTransactionV2(
    input.prepared.transaction,
    input.prepared.expectedNonce,
  );
  const gasEstimate = parseWalletQuantityV2(await input.wallet.request({
    method: "eth_estimateGas",
    params: [rpcTransaction],
  }), "Gas estimation");
  await assertExecutionBlockHashV2(input.readClient, currentBlock, currentHash);
  await assertExecutionAuthorityV2(input.wallet, input.readClient, context.owner);
  parseExecutionContextV2({ ...verified, nowSec: input.nowSec() });
  const hash = parseWalletHashV2(await input.wallet.request({
    method: "eth_sendTransaction",
    params: [rpcTransaction],
  }));
  return Object.freeze({
    label: input.prepared.transaction.label,
    hash,
    preBlockNumber: input.prepared.preBlockNumber,
    preBlockHash: input.prepared.preBlockHash,
    gasEstimate,
    expectedNonce: input.prepared.expectedNonce,
  });
}

function samePreparedTransaction(
  transaction: ExecutionTransactionV2,
  prepared: GuidedPreparedStepV2,
) {
  return transaction.to !== null &&
    isAddressEqual(transaction.from, prepared.transaction.from) &&
    isAddressEqual(transaction.to, prepared.transaction.to) &&
    transaction.value === prepared.transaction.value &&
    transaction.input.toLowerCase() === prepared.transaction.data.toLowerCase();
}

export async function recoverGuidedSubmissionV2(
  readClient: ExecutionReadClientV2,
  prepared: GuidedPreparedStepV2,
): Promise<Hash | undefined> {
  await assertExecutionReadChainV2(readClient);
  if (prepared.expectedNonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Prepared transaction nonce is unsafe");
  }
  const latest = await readClient.getBlockNumber();
  if (latest <= prepared.preBlockNumber) return undefined;
  if (latest - prepared.preBlockNumber > MAX_RECOVERY_BLOCKS) {
    throw new Error("Guided transaction recovery window was exceeded");
  }
  const ownerNonceTransactions: ExecutionTransactionV2[] = [];
  for (let block = prepared.preBlockNumber + 1n; block <= latest; block += 1n) {
    const transactions = await readClient.getBlockTransactions(block);
    ownerNonceTransactions.push(...transactions.filter((transaction) =>
      isAddressEqual(transaction.from, prepared.transaction.from) &&
      transaction.nonce === Number(prepared.expectedNonce)));
  }
  if (ownerNonceTransactions.length === 0) return undefined;
  const exact = ownerNonceTransactions.filter((transaction) =>
    samePreparedTransaction(transaction, prepared));
  if (ownerNonceTransactions.length === 1 && exact.length === 1) return exact[0].hash;
  if (exact.length > 1) throw new Error("Guided transaction recovery is ambiguous");
  throw new Error("Prepared nonce was consumed by a different transaction");
}
