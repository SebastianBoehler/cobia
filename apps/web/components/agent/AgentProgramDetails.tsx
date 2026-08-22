import { Blocks, Bot, ChevronDown, Clock3, ShieldCheck } from "lucide-react";
import { formatTokenAmount } from "../../lib/token-amount";
import { shortAddress } from "../../lib/wallet/eip1193";
import type { ProgramView } from "./agent-program-types";
import styles from "./AgentProgramView.module.css";

const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const readableCode = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function AgentProgramDetails({ program, tokenLabel, tokenDecimals }: {
  program: ProgramView;
  tokenLabel(address: string): string;
  tokenDecimals(address: string): number;
}) {
  const { submission, artifacts } = program;
  const actions = artifacts.program?.payload?.actions ?? [];
  const approvals = artifacts.execution?.payload?.program?.actions
    ?.flatMap((action) => action.approvals ?? []) ?? [];
  const routeSteps = actions.map((action) => {
    const parameters = action.parameters;
    if (parameters?.tokenIn && parameters.tokenOut && parameters.amountInAtomic && parameters.minimumOutputAtomic) {
      return `Swap ${formatTokenAmount(parameters.amountInAtomic, tokenDecimals(parameters.tokenIn))} ${tokenLabel(parameters.tokenIn)} for at least ${formatTokenAmount(parameters.minimumOutputAtomic, tokenDecimals(parameters.tokenOut))} ${tokenLabel(parameters.tokenOut)}`;
    }
    return `${action.capabilityId} @ ${action.capabilityVersion}`;
  });
  const validUntil = new Date(submission.validUntil);

  return <details className={styles.details}>
    <summary>
      <span><strong>Verification details</strong><small>Replay, wallet calls, and audit identifiers</small></span>
      <ChevronDown aria-hidden="true" />
    </summary>
    <div className={styles.detailsBody}>
      <section className={styles.detailSection} aria-labelledby="replay-heading">
        <h2 id="replay-heading">{artifacts.replay?.payload?.reproduced
          ? "Replay reproduced the signed outcome"
          : "Replay was not accepted"}</h2>
        <p>{artifacts.replay?.payload?.reproduced
          ? "The fork replay matched the solver evidence before execution."
          : "No replay artifact was accepted, so this program cannot execute."}</p>
        {submission.failureCodes.length > 0 ? <div className={styles.failureCodes}>
          {submission.failureCodes.map((code) => <code key={code}>{readableCode(code)}</code>)}
        </div> : null}
      </section>

      <section className={styles.detailSection} aria-labelledby="calls-heading">
        <h2 id="calls-heading">Verified calls</h2>
        {approvals.length + routeSteps.length > 0 ? <ol className={styles.routeList}>
          {approvals.map((approval, index) => <li key={`${approval.token}-${index}`}>
            <span>{index + 1}</span><div><strong>Approve up to {formatTokenAmount(
              approval.amount, tokenDecimals(approval.token),
            )} {tokenLabel(approval.token)}</strong><p>Requested only when allowance is short.</p></div>
          </li>)}
          {routeSteps.map((step, index) => <li key={`${step}-${index}`}>
            <span>{approvals.length + index + 1}</span><div><strong>{step}</strong>
              <p>{actions[index]?.capabilityId} @ {actions[index]?.capabilityVersion}</p></div>
          </li>)}
        </ol> : <p className={styles.empty}>No public wallet calls were recorded.</p>}
      </section>

      <section className={`${styles.detailSection} ${styles.ledger}`} aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">Pinned facts</h2>
        <dl>
          <div><dt><Bot aria-hidden="true" /> Solver</dt><dd>{submission.solverId}</dd></div>
          <div><dt><Blocks aria-hidden="true" /> Anchor block</dt><dd>{submission.blockNumber}</dd></div>
          <div><dt><Clock3 aria-hidden="true" /> Valid until</dt><dd><time dateTime={submission.validUntil}>{validUntil.toLocaleString()}</time></dd></div>
          <div><dt><ShieldCheck aria-hidden="true" /> Owner</dt><dd>{submission.owner ? shortAddress(submission.owner) : "Unavailable"}</dd></div>
          <div><dt>Program commitment</dt><dd title={submission.programHash}>{shortHash(submission.programHash)}</dd></div>
          <div><dt>Block commitment</dt><dd title={submission.blockHash}>{shortHash(submission.blockHash)}</dd></div>
        </dl>
      </section>
    </div>
  </details>;
}
