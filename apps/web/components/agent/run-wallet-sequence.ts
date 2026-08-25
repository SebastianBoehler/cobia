import type { Hash } from "viem";

export interface SequenceCall { to: `0x${string}`; data: `0x${string}`; value: "0x0" }
export interface PreparedSequence {
  approvals: SequenceCall[];
  execution?: SequenceCall;
  transactions?: (SequenceCall & { stageId: string })[];
  chainId?: 1 | 196 | 8453;
  approvalPolicy?: "exact" | "at-least-required";
}

function sameCall(left: SequenceCall | undefined, right: SequenceCall | undefined) {
  return Boolean(left && right && left.to.toLowerCase() === right.to.toLowerCase() &&
    left.data.toLowerCase() === right.data.toLowerCase() && left.value === right.value);
}

export async function runWalletSequence(input: {
  initial: PreparedSequence;
  refresh(): Promise<PreparedSequence>;
  switchChain(chainId: 1 | 196 | 8453): Promise<void>;
  send(call: SequenceCall, confirmations: number, allowSufficientApproval: boolean): Promise<Hash>;
  onApproval(index: number): void;
  onTransaction(index: number, hashes: Hash[]): void;
}) {
  if (input.initial.chainId) await input.switchChain(input.initial.chainId);
  const hashes: Hash[] = [];
  const initialFlexibleApproval = input.initial.approvalPolicy === "at-least-required";
  for (const [index, approval] of input.initial.approvals.entries()) {
    input.onApproval(index);
    hashes.push(await input.send(approval, 0, initialFlexibleApproval));
    input.onApproval(index + 1);
  }
  let ready = await input.refresh();
  if (ready.approvals.length > 0) {
    throw new Error("Wallet did not establish the exact verified amount. Cobia stopped before execution.");
  }
  if (ready.chainId) await input.switchChain(ready.chainId);
  let calls = ready.transactions ?? (ready.execution ? [ready.execution] : []);
  if (calls.length === 0) throw new Error("No verified execution call is available.");
  for (let index = 0; index < calls.length; ++index) {
    input.onTransaction(index, [...hashes]);
    hashes.push(await input.send(calls[index]!, 1,
      ready.approvalPolicy === "at-least-required"));
    input.onTransaction(index + 1, [...hashes]);
    if (index + 1 >= calls.length) continue;
    ready = await input.refresh();
    if (ready.approvals.length > 0) {
      throw new Error("Wallet approval no longer matches the exact verified amount.");
    }
    if (ready.chainId) await input.switchChain(ready.chainId);
    const refreshed = ready.transactions ?? (ready.execution ? [ready.execution] : []);
    if (!sameCall(refreshed[index + 1], calls[index + 1])) {
      throw new Error("Verified wallet sequence changed before the next call.");
    }
    calls = refreshed;
  }
  return { ready, hashes, transactionHash: hashes.at(-1)! };
}
