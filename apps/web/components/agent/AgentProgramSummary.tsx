import {
  ArrowRight, ArrowDownUp, Blocks, Bot, CircleAlert, CircleCheck, Clock3, History, Route, ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { formatTokenAmount } from "../../lib/token-amount";
import { shortAddress } from "../../lib/wallet/eip1193";
import type { ProgramView } from "./agent-program-types";
import styles from "./AgentProgramView.module.css";

const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const readableCode = (value: string) => value.toLowerCase().replaceAll("_", " ");

function status(program: ProgramView) {
  const { submission, artifacts } = program;
  if (submission.state === "current") return {
    label: "Live and executable", tone: "live", icon: ShieldCheck,
    detail: "Independently replayed and inside the signed freshness window.",
  } as const;
  if (submission.failureCodes.length > 0) return {
    label: "Verification failed", tone: "failed", icon: CircleAlert,
    detail: "The route was discovered, but no independent replay was accepted.",
  } as const;
  if (artifacts.replay?.payload?.reproduced) return {
    label: "Verified history", tone: "history", icon: CircleCheck,
    detail: "The replay succeeded, but its signed execution window has closed.",
  } as const;
  return {
    label: "Past discovery", tone: "history", icon: History,
    detail: "Historical route research only. Current calldata must be regenerated.",
  } as const;
}

export function AgentProgramSummary({ program, action }: {
  program: ProgramView;
  action?: React.ReactNode;
}) {
  const { submission, artifacts } = program;
  const state = status(program);
  const StatusIcon = state.icon;
  const actions = artifacts.program?.payload?.actions ?? [];
  const tokenEvidence = artifacts.snapshot?.payload?.tokenEvidence ?? [];
  const balanceDeltas = artifacts.evidence?.payload?.balanceDeltas ?? [];
  const balanceConstraints = artifacts.program?.payload?.balanceConstraints ?? [];
  const approvals = artifacts.execution?.payload?.program?.actions
    ?.flatMap((action) => action.approvals ?? []) ?? [];
  const validUntil = new Date(submission.validUntil);
  const token = (address: string) => tokenEvidence.find((item) =>
    item.token.toLowerCase() === address.toLowerCase());
  const tokenLabel = (address: string) => token(address)?.symbol ?? shortAddress(address as `0x${string}`);
  const tokenDecimals = (address: string) => token(address)?.decimals ?? 6;
  const routeSteps = actions.map((action) => {
    const parameters = action.parameters;
    if (parameters?.tokenIn && parameters.tokenOut && parameters.amountInAtomic && parameters.minimumOutputAtomic) {
      return `Swap ${formatTokenAmount(parameters.amountInAtomic, tokenDecimals(parameters.tokenIn))} ${tokenLabel(parameters.tokenIn)} for at least ${formatTokenAmount(parameters.minimumOutputAtomic, tokenDecimals(parameters.tokenOut))} ${tokenLabel(parameters.tokenOut)}`;
    }
    return `${action.capabilityId} @ ${action.capabilityVersion}`;
  });

  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1>{submission.displayGoal ?? "Agent-authored route"}</h1>
        <p className={styles.lead}>A solver proposal with its route, pinned chain state, and independent verification boundary shown separately.</p>
      </div>
      <div className={`${styles.statusCard} ${styles[state.tone]}`}>
        <span className={styles.statusIcon}><StatusIcon aria-hidden="true" /></span>
        <div><span className={styles.statusLabel}>{state.label}</span><p>{state.detail}</p></div>
      </div>
    </header>

    <section className={styles.primaryGrid} aria-label="Execution review">
      <article className={`${styles.card} ${styles.outcomeCard}`}>
        <header className={styles.cardHeader}>
          <div><span className={styles.sectionIcon}><ArrowDownUp aria-hidden="true" /></span>
            <div><p className={styles.kicker}>Fork replay</p><h2>Simulated balance change</h2></div>
          </div>
        </header>
        {balanceDeltas.length > 0 ? <ul className={styles.balanceList}>{balanceDeltas.map((delta) => {
          const before = BigInt(delta.beforeAtomic);
          const after = BigInt(delta.afterAtomic);
          const change = after - before;
          const constraint = balanceConstraints.find((item) => item.token.toLowerCase() === delta.token.toLowerCase());
          const decimals = tokenDecimals(delta.token);
          const label = tokenLabel(delta.token);
          return <li key={delta.token}>
            <div><span>{label}</span><strong>{change >= 0n ? "+" : ""}{formatTokenAmount(change.toString(), decimals)} {label}</strong></div>
            <p>{formatTokenAmount(delta.beforeAtomic, decimals)} → {formatTokenAmount(delta.afterAtomic, decimals)} {label}</p>
            {constraint ? <small>Minimum signed outcome: +{formatTokenAmount(constraint.atomic, decimals)} {label}</small> : null}
          </li>;
        })}</ul> : <p className={styles.empty}>No simulated wallet balance changes were recorded.</p>}
      </article>

      <article className={`${styles.card} ${styles.stepsCard}`}>
        <header className={styles.cardHeader}>
          <div><span className={styles.sectionIcon}><Route aria-hidden="true" /></span>
            <div><p className={styles.kicker}>Wallet sequence</p><h2>Transaction steps</h2></div>
          </div>
          <span className={styles.count}>{approvals.length + routeSteps.length} {approvals.length + routeSteps.length === 1 ? "step" : "steps"}</span>
        </header>
        {approvals.length + routeSteps.length > 0 ? <ol className={styles.routeList}>
          {approvals.map((approval, index) => <li key={`${approval.token}-${index}`}><span>{index + 1}</span>
            <div><strong>Approve up to {formatTokenAmount(approval.amount, tokenDecimals(approval.token))} {tokenLabel(approval.token)}</strong>
              <p>Only requested if the executor needs additional allowance.</p></div>
          </li>)}
          {routeSteps.map((step, index) => <li key={`${step}-${index}`}><span>{approvals.length + index + 1}</span>
            <div><strong>{step}</strong><p>{actions[index]?.capabilityId} @ {actions[index]?.capabilityVersion}</p></div>
          </li>)}
        </ol> : <p className={styles.empty}>No public transaction steps were recorded.</p>}
      </article>
    </section>

    <section className={styles.replaySummary} aria-labelledby="replay-heading">
      <span className={styles.sectionIcon}><ShieldCheck aria-hidden="true" /></span>
      <div><p className={styles.kicker}>Independent check</p><h2 id="replay-heading">{artifacts.replay?.payload?.reproduced ? "Replay reproduced this outcome" : "Replay was not accepted"}</h2>
        <p>{artifacts.replay?.payload?.reproduced
          ? "The fork replay matched the solver evidence and the balance changes shown above."
          : "No replay artifact was accepted, so this program cannot be executed."}</p></div>
      {submission.failureCodes.length > 0 ? <div className={styles.failureCodes}>
        <span>Failure code</span>
        {submission.failureCodes.map((code) => <code key={code}>{readableCode(code)}</code>)}
      </div> : null}
    </section>

    <footer className={styles.footerAction}>
      <div><strong>{submission.executable ? "Ready for owner review" : "Need a current route?"}</strong>
        <p>{submission.executable ? "Execution still requires the signed intent owner wallet." : "Create a fresh intent to capture current state and run verification again."}</p></div>
      {action ?? <Link className="button button--primary" href="/intents/new">Create fresh intent <ArrowRight aria-hidden="true" size={16} /></Link>}
    </footer>

    <section className={styles.ledger} aria-labelledby="evidence-heading">
      <header><div><p className={styles.kicker}>Evidence ledger</p><h2 id="evidence-heading">Pinned facts</h2></div>
        <p>Immutable identifiers used to audit this revision.</p></header>
      <dl>
        <div><dt><Bot aria-hidden="true" /> Solver</dt><dd>{submission.solverId}</dd></div>
        <div><dt><Blocks aria-hidden="true" /> Anchor block</dt><dd>{submission.blockNumber}</dd></div>
        <div><dt><Clock3 aria-hidden="true" /> Valid until</dt><dd><time dateTime={submission.validUntil}>{validUntil.toLocaleString()}</time></dd></div>
        <div><dt><ShieldCheck aria-hidden="true" /> Owner</dt><dd>{submission.owner ? shortAddress(submission.owner) : "Unavailable"}</dd></div>
        <div className={styles.hash}><dt>Program commitment</dt><dd title={submission.programHash}>{shortHash(submission.programHash)}</dd></div>
        <div className={styles.hash}><dt>Block commitment</dt><dd title={submission.blockHash}>{shortHash(submission.blockHash)}</dd></div>
      </dl>
    </section>

    {artifacts.receipt?.payload?.transactionHash ? <p className={styles.receipt}>Confirmed transaction <code>{artifacts.receipt.payload.transactionHash}</code></p> : null}
  </div>;
}
