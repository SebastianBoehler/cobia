import { ArrowRight, Check, CircleAlert, CircleCheck, ExternalLink, History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { xLayer } from "../../lib/chain/xlayer";
import { goalTitleDensity } from "../../lib/intents/goal-title-density";
import { formatTokenAmount } from "../../lib/token-amount";
import { shortAddress } from "../../lib/wallet/eip1193";
import { AgentProgramDetails } from "./AgentProgramDetails";
import type { ProgramView } from "./agent-program-types";
import styles from "./AgentProgramView.module.css";

const readableCode = (value: string) => value.toLowerCase().replaceAll("_", " ");

function status(program: ProgramView) {
  const { submission, artifacts } = program;
  const verifiedReplay = artifacts.replay?.payload?.reproduced ||
    (artifacts.verdict?.payload?.accepted && Boolean(artifacts.evidence?.payload));
  if (artifacts.receipt?.payload?.transactionHash) return {
    label: "Swap complete", tone: "live", icon: Check,
    detail: "Confirmed on X Layer and attributed to the intent owner.",
  } as const;
  if (submission.state === "current") return {
    label: "Ready to execute", tone: "live", icon: ShieldCheck,
    detail: "Independently replayed inside the signed execution window.",
  } as const;
  if (submission.failureCodes.length > 0) return {
    label: "Verification failed", tone: "failed", icon: CircleAlert,
    detail: `Verification stopped: ${readableCode(submission.failureCodes[0]!)}.`,
  } as const;
  if (verifiedReplay) return {
    label: "Verified history", tone: "history", icon: CircleCheck,
    detail: "The replay passed, but the execution window has closed.",
  } as const;
  return { label: "Past discovery", tone: "history", icon: History,
    detail: "Historical research only. Generate a current route before execution." } as const;
}

export function AgentProgramSummary({ program, action }: {
  program: ProgramView;
  action?: React.ReactNode;
}) {
  const { submission, artifacts } = program;
  const state = status(program);
  const StatusIcon = state.icon;
  const tokenEvidence = artifacts.snapshot?.payload?.tokenEvidence ?? [];
  const token = (address: string) => tokenEvidence.find((item) =>
    item.token.toLowerCase() === address.toLowerCase());
  const tokenLabel = (address: string) => token(address)?.symbol ?? shortAddress(address as `0x${string}`);
  const tokenDecimals = (address: string) => token(address)?.decimals ?? 6;
  const receipt = artifacts.receipt?.payload;
  const constraints = artifacts.program?.payload?.balanceConstraints ?? [];
  const evidence = artifacts.evidence?.payload;
  const simulatedChanges = evidence?.balanceDeltas ?? evidence?.simulations
    ?.flatMap(({ assetDeltas }) => assetDeltas)
    .filter(({ account, beforeAtomic, afterAtomic }) =>
      (!submission.owner || account.toLowerCase() === submission.owner.toLowerCase()) &&
      BigInt(afterAtomic) > BigInt(beforeAtomic)) ?? [];
  const balanceChanges = receipt?.balanceChanges ?? simulatedChanges;
  const completed = Boolean(receipt?.transactionHash);
  const generalAsset = artifacts.execution?.payload?.version === 4 &&
    artifacts.execution.payload.kind === "general-asset-execution";

  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1 data-title-density={goalTitleDensity(submission.displayGoal ?? "Agent-authored route")}>
          {submission.displayGoal ?? "Agent-authored route"}
        </h1>
      </div>
      <div className={`${styles.statusCard} ${styles[state.tone]}`} role="status" aria-live="polite">
        <span className={styles.statusIcon}><StatusIcon aria-hidden="true" /></span>
        <div><strong>{state.label}</strong><p>{state.detail}</p></div>
      </div>
    </header>

    <section className={`${styles.resultCard} ${completed ? styles.completed : ""}`} aria-label={
      completed ? "Confirmed swap result" : "Expected swap result"
    }>
      <div className={styles.resultMain}>
        <h2 className={styles.resultHeading}>{completed ? "Received" : "Fork replay estimate"}</h2>
        {balanceChanges.length > 0 ? <ul className={styles.balanceList}>{balanceChanges.map((delta) => {
          const change = BigInt(delta.afterAtomic) - BigInt(delta.beforeAtomic);
          const label = tokenLabel(delta.token);
          const constraint = constraints.find((item) => item.token.toLowerCase() === delta.token.toLowerCase());
          return <li key={delta.token}>
            <strong>{change >= 0n ? "+" : ""}{formatTokenAmount(change.toString(), tokenDecimals(delta.token))} {label}</strong>
            <span>{formatTokenAmount(delta.beforeAtomic, tokenDecimals(delta.token))} → {formatTokenAmount(delta.afterAtomic, tokenDecimals(delta.token))} {label}</span>
            {!completed && constraint ? <small>Minimum signed outcome: +{formatTokenAmount(
              constraint.atomic, tokenDecimals(delta.token),
            )} {label}</small> : null}
          </li>;
        })}</ul> : <p className={styles.empty}>{completed
          ? "The transaction was confirmed; no token balance delta was recorded."
          : "No simulated wallet balance change was recorded."}</p>}
        {!completed ? <p className={styles.disclaimer}>Simulation only. The confirmed receipt replaces this estimate after execution.</p> : null}
      </div>

      {completed && receipt?.transactionHash ? <div className={styles.receiptMeta}>
        <dl>
          <div><dt>Network</dt><dd>X Layer Mainnet</dd></div>
          {receipt.blockNumber ? <div><dt>Block</dt><dd>{receipt.blockNumber}</dd></div> : null}
        </dl>
        <a className="button button--primary" href={`${xLayer.blockExplorers.default.url}/tx/${receipt.transactionHash}`}
          target="_blank" rel="noreferrer" aria-label="View transaction in X Layer explorer">
          View transaction <ExternalLink aria-hidden="true" size={16} />
        </a>
        <code title={receipt.transactionHash}>{receipt.transactionHash}</code>
      </div> : <div className={styles.actionPanel}>
        <div><strong>{submission.executable ? "No solver fee during launch" : "Need a current route?"}</strong>
          <p>{submission.executable
            ? generalAsset
              ? "Cobia waives the solver fee. Review the exact ordered stages; every wallet transaction remains separately confirmed and reconciled."
              : "Cobia currently waives the solver fee. A bounded token approval appears only if needed; execution still needs one final confirmation."
            : "Create a fresh intent to capture current state and verify it again."}</p></div>
        {action ?? <Link className="button button--primary" href="/intents/new">Create fresh intent <ArrowRight aria-hidden="true" size={16} /></Link>}
      </div>}
    </section>

    <AgentProgramDetails program={program} tokenLabel={tokenLabel} tokenDecimals={tokenDecimals} />
  </div>;
}
