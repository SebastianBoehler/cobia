import type { Hash } from "viem";

export interface SequenceCall { to: `0x${string}`; data: `0x${string}`; value: "0x0" }
export interface PreparedSequence {
  approvals: SequenceCall[];
  execution?: SequenceCall;
  transactions?: (SequenceCall & { stageId: string })[];
  chainId?: 1 | 196 | 8453;
}

export async function runWalletSequence(input: {
  initial: PreparedSequence;
  refresh(): Promise<PreparedSequence>;
  switchChain(chainId: 1 | 196 | 8453): Promise<void>;
  send(call: SequenceCall, confirmations: number): Promise<Hash>;
  onApproval(index: number): void;
  onTransaction(index: number, hashes: Hash[]): void;
}) {
  if (input.initial.chainId) await input.switchChain(input.initial.chainId);
  for (const [index, approval] of input.initial.approvals.entries()) {
    await input.send(approval, 0);
    input.onApproval(index + 1);
  }
  const ready = await input.refresh();
  if (ready.chainId) await input.switchChain(ready.chainId);
  const calls = ready.transactions ?? (ready.execution ? [ready.execution] : []);
  if (calls.length === 0) throw new Error("No verified execution call is available.");
  const hashes: Hash[] = [];
  for (const [index, call] of calls.entries()) {
    hashes.push(await input.send(call, 1));
    input.onTransaction(index + 1, [...hashes]);
  }
  return { ready, hashes, transactionHash: hashes.at(-1)! };
}
