"use client";

import { CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { buildAgentExecutionAccessProof, type AgentExecutionAccessProof } from "../../lib/coding-agent-sandbox/execution-access";
import { randomBytes32 } from "../../lib/payments/random";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "../wallet/WalletProvider";

interface TransactionCall { to: Address; data: Hex; value: "0x0" }
interface ProgramView {
  id: string;
  state: string;
  validity: "live" | "past-discovery";
  executable: boolean;
  owner: Address;
  blockNumber: string;
  program: { actions: { capabilityId: string; capabilityVersion: number }[]; constraints: unknown[] } | null;
  verdict: { accepted: boolean; errorCodes: string[] } | null;
  provenance: { modelResponseIds?: string[]; commands?: unknown[] } | null;
  replay: { reproduced?: boolean } | null;
  receipt: { transactionHash?: Hash } | null;
}
interface Prepared { approvals: TransactionCall[]; execution: TransactionCall }

function message(value: unknown, fallback: string) {
  return typeof value === "object" && value && "message" in value && typeof value.message === "string"
    ? value.message
    : fallback;
}

async function load(programId: string): Promise<ProgramView> {
  const response = await fetch(`/api/agent-programs/${programId}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(message(body, "Could not load agent program."));
  return body as ProgramView;
}

export function AgentProgramView({ programId }: { programId: string }) {
  const wallet = useWallet();
  const [program, setProgram] = useState<ProgramView>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [approvalIndex, setApprovalIndex] = useState(0);
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
    if (!program || !wallet.account) throw new Error("Connect the signed intent owner wallet.");
    if (!isAddressEqual(wallet.account, program.owner)) {
      throw new Error(`Connect owner ${shortAddress(program.owner)}.`);
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
      const response = await fetch(`/api/agent-programs/${programId}/execution`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: access.value, ownerSignature: access.signature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(message(body, "Execution preflight failed."));
      setPrepared(body as Prepared);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution preflight failed.");
    } finally { setPending(false); }
  }

  async function send(call: TransactionCall): Promise<Hash> {
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
        { status?: string } | null;
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error("Wallet transaction reverted.");
        return hash as Hash;
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
      const transactionHash = await send(prepared.execution);
      const receiptAccess = await accessProof();
      const response = await fetch(`/api/agent-programs/${programId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: receiptAccess.value,
          ownerSignature: receiptAccess.signature,
          transactionHash,
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
  const approvalsDone = approvalIndex >= (prepared?.approvals.length ?? 0);
  return <section className="request-created">
    {program.validity === "live" ? <ShieldCheck aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
    <div>
      <h2>{program.validity === "live" ? "Live verified program" : "Past discovery"}</h2>
      <p>{program.validity === "live"
        ? "Agent-authored, independently replayed, and currently inside its signed freshness window."
        : "Historical research only. Create a fresh intent to regenerate and verify current calldata."}</p>
      <p>Owner {shortAddress(program.owner)} · X Layer mainnet block {program.blockNumber}</p>
      {program.program?.actions.map((action, index) => <p key={`${action.capabilityId}-${index}`}>
        {action.capabilityId}@{action.capabilityVersion}
      </p>)}
      <p>{program.replay?.reproduced ? "Fresh fork replay reproduced the proposal." : "No accepted replay."}</p>
      {program.receipt?.transactionHash ? <p>Confirmed transaction {program.receipt.transactionHash}</p> : null}
    </div>
    {error ? <p role="alert" className="form-alert">{error}</p> : null}
    {program.executable && !prepared ? <button className="button button--primary" disabled={pending} onClick={prepare}>
      {pending ? "Checking live bounds…" : "Prepare execution"}
    </button> : null}
    {prepared && !approvalsDone ? <button className="button button--primary" disabled={pending} onClick={approve}>
      {pending ? "Waiting for approval…" : `Confirm bounded approval ${approvalIndex + 1}/${prepared.approvals.length}`}
    </button> : null}
    {prepared && approvalsDone && !confirmed ? <button className="button button--primary" disabled={pending} onClick={execute}>
      {pending ? "Waiting for X Layer receipt…" : "Confirm exact atomic execution"}
    </button> : null}
  </section>;
}
