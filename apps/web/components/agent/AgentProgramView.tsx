"use client";

import { CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { buildAgentExecutionAccessProof } from "../../lib/coding-agent-sandbox/execution-access";
import { authorizePayment } from "../../lib/payments/eip3009";
import type { PaymentTerms } from "../../lib/payments/terms";
import { randomBytes32 } from "../../lib/payments/random";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";

interface TransactionCall { to: Address; data: Hex; value: "0x0" }
interface PublicArtifact<T> { payload?: T; summary?: T }
interface ProgramView {
  submission: {
    id: string; state: string; executable: boolean; owner: Address | null;
    blockNumber: string; displayGoal: string | null;
  };
  artifacts: {
    program?: PublicArtifact<{ actions?: { capabilityId: string; capabilityVersion: number }[];
      stages?: { id: string; provider?: string; kind: string }[] }>;
    verdict?: PublicArtifact<{ accepted: boolean; errorCodes: string[] }>;
    provenance?: PublicArtifact<{ commandCount: number; fileCount: number; networkRequestCount: number }>;
    replay?: PublicArtifact<{ reproduced?: boolean }>;
    receipt?: PublicArtifact<{ transactionHash?: Hash }>;
  };
}
interface Prepared { approvals: TransactionCall[]; execution?: TransactionCall;
  transactions?: (TransactionCall & { stageId: string })[] }

function message(value: unknown, fallback: string) {
  return typeof value === "object" && value && "message" in value && typeof value.message === "string"
    ? value.message
    : fallback;
}

export function hasRequiredConfirmations(
  receiptBlock: string,
  latestBlock: string,
  confirmations: number,
) {
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
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [transactionIndex, setTransactionIndex] = useState(0);
  const [transactionHashes, setTransactionHashes] = useState<Hash[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState<Hash>();

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

  async function prepare() {
    setPending(true); setError(undefined);
    try {
      await wallet.switchToXLayer();
      const access = await accessProof();
      const requestBody = JSON.stringify({ proof: access.value, ownerSignature: access.signature });
      let response = await fetch(`/api/programs/${programId}/execution`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: requestBody,
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
      setPrepared(body as Prepared);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution preflight failed.");
    } finally { setPending(false); }
  }

  async function send(call: TransactionCall, confirmations = 0): Promise<Hash> {
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
      await send(prepared.approvals[approvalIndex]!);
      setApprovalIndex((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed."); }
    finally { setPending(false); }
  }

  async function execute() {
    if (!prepared) return;
    setPending(true); setError(undefined);
    try {
      const direct = prepared.transactions?.[transactionIndex];
      if (!prepared.execution && !direct) throw new Error("No verified execution call is available.");
      const transactionHash = await send((prepared.execution ?? direct)!, 1);
      const hashes = [...transactionHashes, transactionHash];
      setTransactionHashes(hashes);
      if (direct && transactionIndex + 1 < prepared.transactions!.length) {
        setTransactionIndex((value) => value + 1);
        return;
      }
      const receiptAccess = await accessProof();
      const response = await fetch(`/api/programs/${programId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: receiptAccess.value,
          ownerSignature: receiptAccess.signature,
          ...(prepared.execution ? { transactionHash } : { transactionHashes: hashes }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(message(body, "Receipt attribution failed."));
      setConfirmed(transactionHash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Execution failed."); }
    finally { setPending(false); }
  }

  if (!program && !error) return <section className="request-created"><LoaderCircle className="spin" /> Loading verified program…</section>;
  if (!program) return <p role="alert" className="form-alert">{error}</p>;
  const { submission, artifacts } = program;
  const live = submission.state === "current";
  const provenance = artifacts.provenance?.summary;
  const approvalsDone = approvalIndex >= (prepared?.approvals.length ?? 0);
  return <section className="request-created">
    {live ? <ShieldCheck aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
    <div>
      <h2>{live ? "Live verified program" : "Past discovery"}</h2>
      {submission.displayGoal ? <p><strong>{submission.displayGoal}</strong></p> : null}
      <p>{live
        ? "Agent-authored, independently replayed, and currently inside its signed freshness window."
        : "Historical research only. Create a fresh intent to regenerate and verify current calldata."}</p>
      <p>{submission.owner ? `Owner ${shortAddress(submission.owner)} · ` : ""}X Layer mainnet block {submission.blockNumber}</p>
      {artifacts.program?.payload?.actions?.map((action, index) => <p key={`${action.capabilityId}-${index}`}>
        {action.capabilityId}@{action.capabilityVersion}
      </p>)}
      {artifacts.program?.payload?.stages?.map((stage) => <p key={stage.id}>
        {stage.provider ?? stage.kind} · {stage.id}
      </p>)}
      {provenance ? <p>{provenance.commandCount} commands · {provenance.fileCount} files · {provenance.networkRequestCount} fetched resources</p> : null}
      <p>{artifacts.replay?.payload?.reproduced
        ? "Fresh fork replay reproduced the proposal. This is evidence only; execution below targets X Layer mainnet."
        : "No accepted replay."}</p>
      {artifacts.receipt?.payload?.transactionHash ? <p>Confirmed transaction {artifacts.receipt.payload.transactionHash}</p> : null}
    </div>
    {error ? <p role="alert" className="form-alert">{error}</p> : null}
    {submission.executable && !prepared ? <button className="button button--primary" disabled={pending} onClick={prepare}>
      {pending ? "Checking live bounds…" : "Prepare execution"}
    </button> : null}
    {prepared && !approvalsDone ? <button className="button button--primary" disabled={pending} onClick={approve}>
      {pending ? "Waiting for approval…" : `Confirm bounded approval ${approvalIndex + 1}/${prepared.approvals.length}`}
    </button> : null}
    {prepared && approvalsDone && !confirmed ? <button className="button button--primary" disabled={pending} onClick={execute}>
      {pending ? "Waiting for X Layer mainnet receipt…"
        : prepared.transactions
          ? `Confirm exact call ${transactionIndex + 1}/${prepared.transactions.length}`
          : "Confirm exact mainnet execution"}
    </button> : null}
  </section>;
}
