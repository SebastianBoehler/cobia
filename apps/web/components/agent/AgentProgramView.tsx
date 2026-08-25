"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import {
  buildAgentExecutionAccessProof, type AgentExecutionAccessProof,
} from "../../lib/coding-agent-sandbox/execution-access";
import { authorizePayment } from "../../lib/payments/eip3009";
import type { PaymentTerms } from "../../lib/payments/terms";
import { randomBytes32 } from "../../lib/payments/random";
import { formatTokenAmount } from "../../lib/token-amount";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";
import { GeneralAssetExecutionView } from "../intents/GeneralAssetExecutionView";
import { AgentProgramSummary } from "./AgentProgramSummary";
import type { ProgramView } from "./agent-program-types";
import { assertWalletCallIntegrity } from "./wallet-call-integrity";
import { approvalCallLabel } from "./wallet-call-label";
import { runWalletSequence } from "./run-wallet-sequence";
import styles from "./AgentProgramView.module.css";

interface TransactionCall { to: Address; data: Hex; value: "0x0" }
interface Prepared { approvals: TransactionCall[]; execution?: TransactionCall;
  transactions?: (TransactionCall & { stageId: string })[]; chainId?: 1 | 196 | 8453;
  approvalPolicy?: "exact" | "at-least-required" }
interface ExecutionAccess { value: AgentExecutionAccessProof; signature: Hex }
interface PendingReceipt { ready: Prepared; hashes: Hash[]; transactionHash: Hash }
function message(value: unknown, fallback: string) {
  return typeof value === "object" && value && "message" in value && typeof value.message === "string"
    ? value.message
    : fallback;
}

function approvalLabel(program: ProgramView, index: number, count: number) {
  const approval = program.artifacts.execution?.payload?.program?.actions
    ?.flatMap((action) => action.approvals ?? [])[0];
  if (!approval) return "Allow token spending";
  const token = program.artifacts.snapshot?.payload?.tokenEvidence?.find((item) =>
    item.token.toLowerCase() === approval.token.toLowerCase());
  const symbol = token?.symbol ?? "token";
  if (count > 1 && index === 0) return `Reset ${symbol} allowance`;
  const amount = formatTokenAmount(approval.amount, token?.decimals ?? 6)
    .replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `Allow ${amount} ${symbol}`;
}

function executionLabel(program: ProgramView, prepared: Prepared, transactionIndex: number) {
  if (prepared.transactions) {
    const call = prepared.transactions[transactionIndex];
    const approval = call && approvalCallLabel(call,
      program.artifacts.snapshot?.payload?.tokenEvidence ?? [], {
        allowSufficientApproval: prepared.approvalPolicy === "at-least-required",
      });
    return approval?.label ?? `Submit verified call ${transactionIndex + 1}/${prepared.transactions.length}`;
  }
  const action = program.artifacts.program?.payload?.actions?.[0];
  if (action?.parameters?.tokenIn && action.parameters.tokenOut) return "Swap now";
  if (action?.capabilityId.includes("supply")) return "Supply now";
  return "Execute now";
}

export function hasRequiredConfirmations(receiptBlock: string, latestBlock: string, confirmations: number) {
  if (!/^0x[0-9a-fA-F]+$/.test(receiptBlock) || !/^0x[0-9a-fA-F]+$/.test(latestBlock) ||
    !Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error("Wallet returned invalid block confirmation data");
  }
  return BigInt(latestBlock) >= BigInt(receiptBlock) + BigInt(confirmations);
}

async function load(programId: string): Promise<ProgramView> {
  const response = await fetch(`/api/programs/${programId}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(message(body, "Could not load agent program."));
  return body as ProgramView;
}

export function AgentProgramView({ programId }: { programId: string }) {
  const wallet = useWallet();
  const [program, setProgram] = useState<ProgramView>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [executionAccess, setExecutionAccess] = useState<ExecutionAccess>();
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [transactionIndex, setTransactionIndex] = useState(0);
  const [transactionHashes, setTransactionHashes] = useState<Hash[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState<Hash>();
  const [pendingReceipt, setPendingReceipt] = useState<PendingReceipt>();

  useEffect(() => {
    let active = true;
    load(programId).then((value) => { if (active) setProgram(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Load failed."); });
    return () => { active = false; };
  }, [programId]);

  async function accessProof() {
    const owner = program?.submission.owner;
    if (!owner || !wallet.account) throw new Error("Connect the signed intent owner wallet.");
    if (!isAddressEqual(wallet.account, owner)) {
      throw new Error(`Connect owner ${shortAddress(owner)}.`);
    }
    const value = buildAgentExecutionAccessProof({
      programId,
      owner: wallet.account,
      realm: window.location.host,
      nonce: randomBytes32(),
      expiresAt: Math.floor(Date.now() / 1_000) + 300,
    });
    const signature = await wallet.request({
      method: "personal_sign",
      params: [value.commitment, wallet.account],
    });
    if (typeof signature !== "string") throw new Error("Wallet returned an invalid access signature.");
    return { value, signature: signature as Hex };
  }

  async function requestExecution(access: ExecutionAccess): Promise<Prepared> {
    const requestBody = JSON.stringify({ proof: access.value, ownerSignature: access.signature });
    let response = await fetch(`/api/programs/${programId}/execution`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody,
    });
    let body = await response.json();
    if (response.status === 402) {
      if (!wallet.account) throw new Error("Connect the owner wallet.");
      const credential = await authorizePayment(response, {
        account: wallet.account, request: wallet.request, switchChain: wallet.switchChain,
      }, { terms: body.terms as PaymentTerms, owner: wallet.account });
      response = await fetch(`/api/programs/${programId}/execution`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: credential },
        body: requestBody,
      });
      body = await response.json();
    }
    if (!response.ok) throw new Error(message(body, "Execution preflight failed."));
    return body as Prepared;
  }

  async function prepare() {
    setPending(true); setError(undefined);
    try {
      await wallet.switchToXLayer();
      const access = await accessProof();
      setExecutionAccess(access);
      const body = await requestExecution(access);
      if (body.chainId === 1 || body.chainId === 196 || body.chainId === 8453) {
        await wallet.switchChain(body.chainId);
      }
      setPrepared(body);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const completed = await runWalletSequence({
        initial: body,
        refresh: () => requestExecution(access),
        switchChain: wallet.switchChain,
        send,
        onApproval: setApprovalIndex,
        onTransaction: (index, hashes) => {
          setTransactionIndex(index);
          setTransactionHashes(hashes);
        },
      });
      setPrepared(completed.ready);
      setPendingReceipt({ ready: completed.ready, hashes: completed.hashes,
        transactionHash: completed.transactionHash });
      await attributeReceipt(completed.ready, access, completed.hashes, completed.transactionHash);
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Execution preflight failed.";
      try {
        const refreshed = await load(programId);
        setProgram(refreshed);
        setError(failure);
      } catch { setError(failure); }
    } finally { setPending(false); }
  }

  async function send(call: TransactionCall, confirmations = 0,
    allowSufficientApproval = false): Promise<Hash> {
    if (!wallet.account) throw new Error("Connect the owner wallet.");
    const hash = await wallet.request({
      method: "eth_sendTransaction",
      params: [{ from: wallet.account, ...call }],
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error("Wallet returned an invalid transaction hash.");
    }
    for (let attempt = 0; attempt < 120; ++attempt) {
      const receipt = await wallet.request({ method: "eth_getTransactionReceipt", params: [hash] }) as
        { status?: string; blockNumber?: string } | null;
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error("Wallet transaction reverted.");
        const transaction = await wallet.request({ method: "eth_getTransactionByHash", params: [hash] }) as
          { from?: string; to?: string | null; input?: string; value?: string } | null;
        assertWalletCallIntegrity(call, wallet.account, transaction, { allowSufficientApproval });
        if (confirmations === 0) return hash as Hash;
        if (!receipt.blockNumber) throw new Error("Wallet receipt omitted its block number.");
        const latestBlock = await wallet.request({ method: "eth_blockNumber" });
        if (typeof latestBlock !== "string") throw new Error("Wallet returned an invalid latest block.");
        if (hasRequiredConfirmations(receipt.blockNumber, latestBlock, confirmations)) return hash as Hash;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
    throw new Error("Transaction confirmation timed out.");
  }

  async function approve() {
    if (!prepared) return;
    setPending(true); setError(undefined);
    try {
      if (prepared.chainId) await wallet.switchChain(prepared.chainId);
      await send(prepared.approvals[approvalIndex]!, 0,
        prepared.approvalPolicy === "at-least-required");
      setApprovalIndex((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed."); }
    finally { setPending(false); }
  }

  async function attributeReceipt(
    ready: Prepared,
    access: ExecutionAccess,
    hashes: Hash[],
    transactionHash: Hash,
  ) {
    const response = await fetch(`/api/programs/${programId}/execution/receipt`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proof: access.value,
        ownerSignature: access.signature,
        ...(ready.execution ? { transactionHash } : { transactionHashes: hashes }),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(message(body, "Receipt attribution failed."));
    setPendingReceipt(undefined);
    setConfirmed(transactionHash);
    setProgram((current) => current ? {
      ...current,
      submission: { ...current.submission, state: "executed", executable: false },
      artifacts: { ...current.artifacts, receipt: { payload: body.receipt } },
    } : current);
    load(programId).then(setProgram).catch(() => undefined);
  }

  async function retryReceipt() {
    if (!pendingReceipt) return;
    setPending(true); setError(undefined);
    try {
      const access = await accessProof();
      setExecutionAccess(access);
      await attributeReceipt(pendingReceipt.ready, access, pendingReceipt.hashes,
        pendingReceipt.transactionHash);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Receipt attribution failed.");
    } finally { setPending(false); }
  }

  async function execute() {
    if (!prepared) return;
    setPending(true); setError(undefined);
    try {
      const access = executionAccess?.value.expiresAt &&
        executionAccess.value.expiresAt > Math.floor(Date.now() / 1_000) + 10
        ? executionAccess : await accessProof();
      const ready = await requestExecution(access);
      setExecutionAccess(access); setPrepared(ready);
      if (ready.chainId) await wallet.switchChain(ready.chainId);
      const direct = ready.transactions?.[transactionIndex];
      if (!ready.execution && !direct) throw new Error("No verified execution call is available.");
      const transactionHash = await send((ready.execution ?? direct)!, 1,
        ready.approvalPolicy === "at-least-required");
      const hashes = [...transactionHashes, transactionHash];
      setTransactionHashes(hashes);
      if (direct && transactionIndex + 1 < prepared.transactions!.length) {
        setTransactionIndex((value) => value + 1);
        return;
      }
      setPendingReceipt({ ready, hashes, transactionHash });
      await attributeReceipt(ready, access, hashes, transactionHash);
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Execution failed.";
      setPrepared(undefined);
      setExecutionAccess(undefined);
      setApprovalIndex(0);
      setTransactionIndex(0);
      setTransactionHashes([]);
      try {
        const refreshed = await load(programId);
        setProgram(refreshed);
        setError(refreshed.submission.executable ? failure : undefined);
      } catch {
        setError(failure);
      }
    }
    finally { setPending(false); }
  }

  if (!program && !error) return <section className={styles.loading}><LoaderCircle className="spin" /> Loading program evidence…</section>;
  if (!program) return <p role="alert" className="form-alert">{error}</p>;
  if (program.artifacts.execution?.payload?.version === 4 &&
      program.artifacts.execution.payload.kind === "general-asset-execution") {
    return <GeneralAssetExecutionView program={program} />;
  }
  const { submission } = program;
  const approvalsDone = approvalIndex >= (prepared?.approvals.length ?? 0);
  const directApproval = prepared?.transactions?.[transactionIndex] && approvalCallLabel(
    prepared.transactions[transactionIndex]!, program.artifacts.snapshot?.payload?.tokenEvidence ?? [],
    { allowSufficientApproval: prepared.approvalPolicy === "at-least-required" },
  );
  const errorNotice = error ? <p role="alert" className="form-alert">{error}</p> : null;
  const action = <>
    {errorNotice}
    {pendingReceipt && !confirmed ? <button className="button button--primary" disabled={pending} onClick={retryReceipt}>
      {pending ? "Verifying confirmed transaction…" : "Retry receipt verification"}
    </button> : null}
    {submission.executable && !prepared && !pendingReceipt ? <button className="button button--primary" disabled={pending} onClick={prepare}>
      {pending ? "Checking live bounds…" : "Prepare execution"}
    </button> : null}
    {prepared && !approvalsDone && !pendingReceipt ? <button className="button button--primary" disabled={pending} onClick={approve}>
      {pending ? "Waiting for approval…" : approvalLabel(program, approvalIndex, prepared.approvals.length)}
    </button> : null}
    {prepared && approvalsDone && !confirmed && !pendingReceipt ? <button className="button button--primary" disabled={pending} onClick={execute}>
      {pending ? `Confirming: ${executionLabel(program, prepared, transactionIndex)}`
        : executionLabel(program, prepared, transactionIndex)}
    </button> : null}
    {directApproval ? <p>
      Choose Max or Unlimited in your wallet instead of typing the exact amount. Cobia accepts any allowance
      that covers this transaction; unused allowance remains active until used or revoked.
    </p> : null}
  </>;
  return <AgentProgramSummary program={program} action={submission.executable ? action : undefined}
    notice={errorNotice} />;
}
