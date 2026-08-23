"use client";

import { useState } from "react";
import { isAddressEqual, toHex, type Address, type Hash, type Hex } from "viem";
import {
  buildAgentExecutionAccessProof, type AgentExecutionAccessProof,
} from "../../lib/coding-agent-sandbox/execution-access";
import {
  assertExactStageTransaction, type PreparedWalletStageTransactionV4,
  type WalletStageTransactionV4,
} from "../../lib/execution-v4/stage-artifact";
import type { StageStateV4 } from "../../lib/execution-v4/stage-machine";
import { randomBytes32 } from "../../lib/payments/random";
import { currentUnixSeconds } from "../../lib/time";
import { shortAddress } from "../../lib/wallet/eip1193";
import { AgentProgramSummary } from "../agent/AgentProgramSummary";
import styles from "../agent/AgentProgramView.module.css";
import type { ProgramView } from "../agent/agent-program-types";
import { useWallet } from "../wallet/WalletProvider";

interface ExecutionAccess { value: AgentExecutionAccessProof; signature: Hex }
interface ReviewStage {
  stageId: Hash; ordinal: number; chainId: 1 | 196; state: StageStateV4;
  transaction: WalletStageTransactionV4 & { nonce?: string };
  delivery: { kind: "none" } | { kind: "bridge"; destinationChainId: 1 | 196 };
}
interface ExecutionReview { programVersion: 4; programId: Hash; stages: ReviewStage[] }

const chainName = (chainId: 1 | 196) => chainId === 1 ? "Ethereum" : "X Layer";
function responseMessage(value: unknown, fallback: string) {
  return typeof value === "object" && value && "message" in value && typeof value.message === "string"
    ? value.message : fallback;
}

export function GeneralAssetExecutionView({ program }: { program: ProgramView }) {
  const wallet = useWallet();
  const programId = program.submission.id;
  const [review, setReview] = useState<ExecutionReview>();
  const [access, setAccess] = useState<ExecutionAccess>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function freshAccess(): Promise<ExecutionAccess> {
    const owner = program.submission.owner;
    if (!owner || !wallet.account) throw new Error("Connect the signed intent owner wallet.");
    if (!isAddressEqual(owner, wallet.account)) throw new Error(`Connect owner ${shortAddress(owner)}.`);
    const value = buildAgentExecutionAccessProof({ programId, owner: wallet.account,
      realm: window.location.host, nonce: randomBytes32(), expiresAt: currentUnixSeconds() + 300 });
    const signature = await wallet.request({ method: "personal_sign", params: [value.commitment, wallet.account] });
    if (typeof signature !== "string") throw new Error("Wallet returned an invalid access signature.");
    return { value, signature: signature as Hex };
  }

  async function currentAccess() {
    if (access && access.value.expiresAt > currentUnixSeconds() + 10) return access;
    const next = await freshAccess(); setAccess(next); return next;
  }

  async function post(path: string, executionAccess: ExecutionAccess, payload?: object) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: executionAccess.value, ownerSignature: executionAccess.signature, ...payload }) });
    const body = await response.json();
    if (!response.ok) throw new Error(responseMessage(body, "General asset execution is unavailable."));
    return body;
  }

  async function loadReview() {
    const executionAccess = await currentAccess();
    const body = await post(`/api/programs/${programId}/execution`, executionAccess) as ExecutionReview;
    if (body.programVersion !== 4 || !Array.isArray(body.stages)) throw new Error("Invalid stage review response.");
    setReview(body);
  }

  async function prepare() {
    setPending(true); setError(undefined);
    try { await loadReview(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Stage review failed."); }
    finally { setPending(false); }
  }

  function updateStage(stageId: Hash, state: StageStateV4) {
    setReview((current) => current ? { ...current,
      stages: current.stages.map((stage) => stage.stageId === stageId ? { ...stage, state } : stage),
    } : current);
  }

  async function reconcile(stage: ReviewStage, executionAccess: ExecutionAccess) {
    const result = await post(`/api/programs/${programId}/stages/${stage.stageId}`, executionAccess,
      { action: "reconcile" }) as { state: StageStateV4 };
    updateStage(stage.stageId, result.state);
  }

  async function executeStage(stage: ReviewStage) {
    setPending(true); setError(undefined);
    try {
      const executionAccess = await currentAccess();
      await wallet.switchChain(stage.chainId);
      const armed = await post(`/api/programs/${programId}/stages/${stage.stageId}`, executionAccess,
        { action: "arm" }) as { state: string; transaction: PreparedWalletStageTransactionV4 };
      if (armed.state !== "broadcasting") throw new Error("Stage was not durably armed.");
      const { nonce: _reviewNonce, ...attested } = stage.transaction;
      assertExactStageTransaction(attested, armed.transaction);
      if (!wallet.account || !isAddressEqual(wallet.account, armed.transaction.from)) {
        throw new Error("Connected wallet does not match the attested sender.");
      }
      const transactionHash = await wallet.request({ method: "eth_sendTransaction", params: [{
        from: wallet.account, to: armed.transaction.to, data: armed.transaction.data,
        value: armed.transaction.value, nonce: toHex(BigInt(armed.transaction.nonce)),
      }] });
      if (typeof transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
        throw new Error("Wallet returned an invalid transaction hash.");
      }
      await post(`/api/programs/${programId}/stages/${stage.stageId}`, executionAccess,
        { action: "submitted", transactionHash: transactionHash.toLowerCase() });
      updateStage(stage.stageId, "submitted");
      await reconcile(stage, executionAccess);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Stage execution failed."); }
    finally { setPending(false); }
  }

  async function refresh(stage?: ReviewStage) {
    setPending(true); setError(undefined);
    try {
      const executionAccess = await currentAccess();
      if (stage?.state === "submitted") await reconcile(stage, executionAccess);
      else await loadReview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Stage status check failed."); }
    finally { setPending(false); }
  }

  const active = review?.stages.find((stage) => !["delivered", "confirmed"].includes(stage.state));
  const action = <>
    {error ? <p role="alert" className="form-alert">{error}</p> : null}
    {review ? <ol className={styles.routeList} aria-label="Execution stages">{review.stages.map((stage) =>
      <li key={stage.stageId}><span>{stage.ordinal + 1}</span><div>
        <strong>Stage {stage.ordinal + 1} · {chainName(stage.chainId)}</strong>
        <p>{stage.state} · {shortAddress(stage.transaction.to as Address)}</p>
      </div></li>)}</ol> : null}
    {!review ? <button className="button button--primary" disabled={pending} onClick={prepare}>
      {pending ? "Loading exact stages…" : "Review execution stages"}
    </button> : null}
    {active && ["pending", "prepared"].includes(active.state) ? <button className="button button--primary"
      disabled={pending} onClick={() => executeStage(active)}>
      {pending ? "Waiting for wallet…" : `Confirm stage ${active.ordinal + 1} on ${chainName(active.chainId)}`}
    </button> : null}
    {active?.state === "submitted" ? <button className="button button--primary" disabled={pending}
      onClick={() => refresh(active)}>{pending ? "Checking finality…" : `Check stage ${active.ordinal + 1} finality`}</button> : null}
    {active?.state === "finalized" && active.delivery.kind === "bridge" ? <>
      <p>Waiting for independently verified bridge delivery.</p>
      <button className="button" disabled={pending} onClick={() => refresh()}>
        {pending ? "Checking delivery…" : "Check bridge delivery"}
      </button>
    </> : null}
    {review && !active ? <p role="status">All exact stages are confirmed.</p> : null}
  </>;
  return <AgentProgramSummary program={program} action={action} />;
}
