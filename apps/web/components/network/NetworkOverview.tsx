import type { NetworkMetricsV1, PublicOutcomeV1 } from "@cobia/domain";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Minus, Route } from "lucide-react";
import Link from "next/link";
import { formatUnits } from "viem";
import { ProtocolMark } from "../brand/ProtocolMark";
import { TokenAssetMark } from "../brand/TokenAssetMark";
import styles from "./NetworkOverview.module.css";

export interface NetworkOverviewReport {
  version: 1;
  observedAt: number;
  window: "30d" | "all";
  metrics: NetworkMetricsV1;
  outcomes: PublicOutcomeV1[];
  nextCursor: string | null;
  exclusions: Record<string, number>;
}

export interface NetworkSolverEvidence {
  id: string;
  displayName: string;
  declaredCapabilities: string[];
  stats: { accepted: number; rejected: number; wins: number; current: number };
}

function usd(value: string): string {
  return `$${formatUnits(BigInt(value), 8)}`;
}

function dateLabel(seconds: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(seconds * 1_000));
}

function metricValue(report: NetworkOverviewReport, kind: "outcomes" | "volume" | "solvers" | "excluded") {
  if (kind === "outcomes") return String(report.metrics.totals.confirmedOutcomes);
  if (kind === "volume") return usd(report.metrics.totals.verifiedVolumeUsdE8);
  if (kind === "solvers") return String(report.metrics.solvers.length);
  return String(Object.values(report.exclusions).reduce((total, count) => total + count, 0));
}

function OverviewMetrics({ report }: { report: NetworkOverviewReport }) {
  const valued = report.metrics.totals.valuedOutcomes;
  const confirmed = report.metrics.totals.confirmedOutcomes;
  const metrics = [
    ["Confirmed outcomes", metricValue(report, "outcomes"), "Winning programs with attributed receipts"],
    ["Verified outcome volume", metricValue(report, "volume"), `${valued} / ${confirmed} valued outcomes`],
    ["Winning solvers", metricValue(report, "solvers"), "Volume attributed only after confirmation"],
    ["Excluded records", metricValue(report, "excluded"), "Incomplete evidence is never counted"],
  ];
  return <dl className={styles.metrics}>{metrics.map(([label, value, detail]) => <div key={label}>
    <dt>{label}</dt><dd><strong>{value}</strong><small>{detail}</small></dd>
  </div>)}</dl>;
}

function TokenRoute({ outcome }: { outcome: PublicOutcomeV1 }) {
  const inputs = [outcome.principal, ...outcome.additionalPrincipals];
  const outputs = outcome.route.minimumOutputs;
  const protocolDescription = outcome.route.protocols.length ? outcome.route.protocols.join(", then ") : "an unrecorded protocol";
  const inputDescription = inputs.map(({ symbol }) => symbol).join(" + ");
  const outputDescription = outputs.map(({ symbol }) => symbol).join(" + ");
  const routeLabel = outputDescription
    ? `${inputDescription} through ${protocolDescription} to ${outputDescription}`
    : `${inputDescription} through ${protocolDescription}`;

  return <div aria-label={routeLabel} className={styles.tokenRoute} role="img">
    <span aria-hidden="true" className={styles.routeAssets}>{inputs.map(({ token, symbol }, index) =>
      <span className={styles.routeAsset} key={token}>
        {index ? <i className={styles.routeJoin}>+</i> : null}
        <TokenAssetMark size={22} symbol={symbol} /><strong>{symbol}</strong>
      </span>)}</span>
    {outcome.route.protocols.map((protocol) => <span aria-hidden="true" className={styles.routeStep} key={protocol}>
      <ArrowRight size={14} /><ProtocolMark protocol={protocol} size={20} />
    </span>)}
    {outputs.length ? <span aria-hidden="true" className={styles.routeStep}>
      <ArrowRight size={14} /><span className={styles.routeAssets}>{outputs.map(({ token, symbol }, index) =>
        <span className={styles.routeAsset} key={token}>
          {index ? <i className={styles.routeJoin}>+</i> : null}
          <TokenAssetMark size={22} symbol={symbol} /><strong>{symbol}</strong>
        </span>)}</span>
    </span> : <span className={styles.unrecorded}>No token outcome recorded</span>}
  </div>;
}

function OutcomeLedger({ outcomes, continuation = false }: { outcomes: PublicOutcomeV1[]; continuation?: boolean }) {
  if (!outcomes.length) return <div className={styles.empty}>
    <Route aria-hidden="true" /><h2>No confirmed outcomes in this window</h2>
    <p>A winning program appears here only after its wallet transaction and signed outcome are independently attributed.</p>
    <Link className="button button--primary" href="/intents/new">Create an intent</Link>
  </div>;
  return <div className={styles.ledgerWrap}><table className={styles.ledger}>
    <caption className="sr-only">{continuation ? "Older confirmed Cobia outcomes" : "Confirmed Cobia outcomes with their route, solver, and public proof"}</caption>
    <thead><tr><th scope="col">Outcome</th><th scope="col">Route</th>
      <th scope="col">Solver</th><th scope="col">Proof</th></tr></thead>
    <tbody>{outcomes.map((outcome) => <tr key={outcome.submissionId}>
      <th data-label="Outcome" scope="row"><time dateTime={new Date(outcome.confirmedAtSec * 1_000).toISOString()}>
        {dateLabel(outcome.confirmedAtSec)}</time><small> · {outcome.ownerLabel}</small>
        <strong>{outcome.resultLabel}</strong></th>
      <td data-label="Route"><TokenRoute outcome={outcome} /></td>
      <td data-label="Solver"><Link href={`/solvers/${outcome.solverId}`}>
        {outcome.solverId}<ArrowRight aria-hidden="true" size={14} /></Link></td>
      <td data-label="Proof"><div className={styles.proofLinks}>
        <Link href={`/programs/${outcome.submissionId}`}>Program</Link>
        <a aria-label={`Transaction for ${outcome.resultLabel} (opens in new tab)`}
          href={`https://web3.okx.com/explorer/x-layer/evm/tx/${outcome.transactionHash}`}
          rel="noreferrer" target="_blank">Tx hash <ArrowUpRight aria-hidden="true" size={13} /></a>
      </div></td>
    </tr>)}</tbody>
  </table></div>;
}

function OutcomeLedgerSection({ report }: { report: NetworkOverviewReport }) {
  const initial = report.outcomes.slice(0, 6);
  const remaining = report.outcomes.slice(6);
  return <>
    <OutcomeLedger outcomes={initial} />
    {remaining.length ? <details className={styles.moreOutcomes}>
      <summary><span>Show {remaining.length} older confirmed outcome{remaining.length === 1 ? "" : "s"}</span>
        <small>{report.outcomes.length} of {report.metrics.totals.confirmedOutcomes} currently loaded</small></summary>
      <OutcomeLedger continuation outcomes={remaining} />
    </details> : null}
  </>;
}

const comparedProtocols = [
  { label: "OKX DEX", capabilities: ["general-asset@", "okx.dex@"], detail: "Live compiled routes" },
  { label: "Aave V3", capabilities: ["aave-v3."], detail: "Bounded supply" },
  { label: "Curve", capabilities: ["curve-stableswap-ng."], detail: "Stable swaps" },
  { label: "Uniswap V3", capabilities: ["uniswap-v3."], detail: "Swap + LP" },
  { label: "Pendle", capabilities: ["pendle."], detail: "Discovery only" },
] as const;

function ProtocolCoverage({ capabilities }: { capabilities: string[] }) {
  return <div aria-label="Declared protocol support" className={styles.protocolCoverage}>
    {comparedProtocols.map(({ label, capabilities: prefixes }) => {
      const enabled = capabilities.some((value) => prefixes.some((prefix) => value.startsWith(prefix)));
      return <span key={label} data-enabled={enabled} title={`${label}: ${enabled ? "declared" : "not declared"}`}>
        <ProtocolMark protocol={label} size={21} />
        {enabled ? <Check aria-hidden="true" size={12} /> : <Minus aria-hidden="true" size={12} />}
        <i className="sr-only">{label} {enabled ? "declared" : "not declared"}</i>
      </span>;
    })}
  </div>;
}

function ProtocolDirectory() {
  return <div aria-label="Supported Cobia protocol integrations" className={styles.protocolDirectory}>
    <span>Integration lanes</span>
    <ul>{comparedProtocols.map(({ label, detail }) => <li key={label}>
      <ProtocolMark protocol={label} size={30} />
      <div><strong>{label}</strong><small>{detail}</small></div>
    </li>)}</ul>
  </div>;
}

function SolverTable({ report, solvers }: {
  report: NetworkOverviewReport;
  solvers: NetworkSolverEvidence[];
}) {
  if (!report.metrics.solvers.length) return null;
  return <section className={styles.section} aria-labelledby="network-solvers">
    <header><div><h2 id="network-solvers">Compare solvers by verified results.</h2>
      <p>Review confirmed volume, winning outcomes, and verifier acceptance before choosing who competes for you.</p></div>
      <Link href="/solvers">Open solver directory <ArrowRight aria-hidden="true" size={15} /></Link></header>
    <ProtocolDirectory />
    <div className={styles.solverRows}>{report.metrics.solvers.map((metric) => {
      const profile = solvers.find(({ id }) => id === metric.solverId);
      const accepted = profile?.stats.accepted ?? 0;
      const resolved = accepted + (profile?.stats.rejected ?? 0);
      return <article key={metric.solverId}>
        <div><strong>{profile?.displayName ?? metric.solverId}</strong><small>{metric.solverId}</small></div>
        <div><span>Verified volume</span><strong>{usd(metric.verifiedVolumeUsdE8)}</strong></div>
        <div><span>Confirmed outcomes</span><strong>{metric.confirmedOutcomes}</strong></div>
        <div><span>Declared protocol support</span><ProtocolCoverage capabilities={profile?.declaredCapabilities ?? []} /></div>
        <div><span>Verifier acceptance</span><strong>{accepted} / {resolved} resolved revisions</strong></div>
        <Link href={`/solvers/${metric.solverId}`}>
          View solver <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </article>;
    })}</div>
  </section>;
}

export function NetworkOverview({ report, solvers }: {
  report: NetworkOverviewReport | null;
  solvers: NetworkSolverEvidence[];
}) {
  return <main className={styles.page} id="main-content">
    <section className={styles.hero}>
      <div><h1>See exactly what happened <em>onchain.</em></h1>
        <p>Trace each confirmed outcome from the winning solver program to the transaction your wallet approved.</p></div>
      <ol aria-label="How an intent becomes confirmed public proof">
        {["Intent signed", "Solvers compete", "Verifier checks", "Wallet approves", "Receipt confirms"]
          .map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span><strong>{step}</strong></li>)}
      </ol>
    </section>
    {!report ? <section className={styles.unavailable}><CircleAlert aria-hidden="true" />
      <div><h2>Network evidence unavailable</h2><p>The verifier-derived projection could not be read. Cobia is not substituting zero totals or sample activity.</p></div>
    </section> : <>
      <OverviewMetrics report={report} />
      <section className={styles.section} aria-labelledby="confirmed-outcomes">
        <header><div><h2 id="confirmed-outcomes">Inspect confirmed outcomes.</h2></div>
          <p>Principal is counted once. Routes show the signed input and outcome assets; proposals, rehearsals, approvals, fees, and internal program legs are excluded.</p></header>
        <OutcomeLedgerSection report={report} />
      </section>
      <SolverTable report={report} solvers={solvers} />
    </>}
  </main>;
}
