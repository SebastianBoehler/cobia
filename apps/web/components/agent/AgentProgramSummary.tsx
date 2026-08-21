import {
  ArrowRight, Blocks, Bot, CircleAlert, CircleCheck, Clock3, FileCode2,
  Globe2, History, Route, ShieldCheck, TerminalSquare,
} from "lucide-react";
import Link from "next/link";
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
  const provenance = artifacts.provenance?.summary;
  const actions = artifacts.program?.payload?.actions ?? [];
  const stages = artifacts.program?.payload?.stages ?? [];
  const routeSteps = [
    ...actions.map((item) => `${item.capabilityId} @ ${item.capabilityVersion}`),
    ...stages.map((item) => `${item.provider ?? item.kind} · ${item.id}`),
  ];
  const validUntil = new Date(submission.validUntil);

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

    <section className={styles.primaryGrid} aria-label="Program overview">
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <div><span className={styles.sectionIcon}><Route aria-hidden="true" /></span>
            <div><p className={styles.kicker}>Proposed route</p><h2>Execution plan</h2></div>
          </div>
          <span className={styles.count}>{routeSteps.length} {routeSteps.length === 1 ? "step" : "steps"}</span>
        </header>
        {routeSteps.length > 0 ? <ol className={styles.routeList}>{routeSteps.map((step, index) =>
          <li key={`${step}-${index}`}><span>{index + 1}</span><code>{step}</code></li>)}</ol>
          : <p className={styles.empty}>No public route steps were recorded.</p>}
      </article>

      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <div><span className={styles.sectionIcon}><ShieldCheck aria-hidden="true" /></span>
            <div><p className={styles.kicker}>Independent check</p><h2>Replay result</h2></div>
          </div>
        </header>
        <div className={styles.replayResult}>
          <strong>{artifacts.replay?.payload?.reproduced ? "Reproduced" : "Not accepted"}</strong>
          <p>{artifacts.replay?.payload?.reproduced
            ? "The fork replay matched the solver evidence."
            : "No replay artifact was accepted, so this program cannot be executed."}</p>
        </div>
        {submission.failureCodes.length > 0 ? <div className={styles.failureCodes}>
          <span>Failure code</span>
          {submission.failureCodes.map((code) => <code key={code}>{readableCode(code)}</code>)}
        </div> : null}
      </article>
    </section>

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

    <section className={styles.provenance} aria-labelledby="provenance-heading">
      <div><p className={styles.kicker}>Agent provenance</p><h2 id="provenance-heading">Research footprint</h2>
        <p>Public counts only. Commands, private paths, credentials, and raw RPC data are never exposed.</p></div>
      <dl>
        <div><TerminalSquare aria-hidden="true" /><dd>{provenance?.commandCount ?? 0}</dd><dt>Commands</dt></div>
        <div><FileCode2 aria-hidden="true" /><dd>{provenance?.fileCount ?? 0}</dd><dt>Files</dt></div>
        <div><Globe2 aria-hidden="true" /><dd>{provenance?.networkRequestCount ?? 0}</dd><dt>Fetched resources</dt></div>
      </dl>
    </section>

    {artifacts.receipt?.payload?.transactionHash ? <p className={styles.receipt}>Confirmed transaction <code>{artifacts.receipt.payload.transactionHash}</code></p> : null}
    <footer className={styles.footerAction}>
      <div><strong>{submission.executable ? "Ready for owner review" : "Need a current route?"}</strong>
        <p>{submission.executable ? "Execution still requires the signed intent owner wallet." : "Create a fresh intent to capture current state and run verification again."}</p></div>
      {action ?? <Link className="button button--primary" href="/intents/new">Create fresh intent <ArrowRight aria-hidden="true" size={16} /></Link>}
    </footer>
  </div>;
}
