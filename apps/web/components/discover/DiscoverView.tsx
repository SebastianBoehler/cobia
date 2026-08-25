import type { CommerceOfferV1 } from "@cobia/domain";
import { ArrowRight, Clock3, History, Repeat2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { ProtocolMark } from "../brand/ProtocolMark";
import { OkxAgentPaymentLookup } from "../commerce/OkxAgentPaymentLookup";
import { CommerceOffers } from "./CommerceOffers";
import styles from "./DiscoverView.module.css";

const supportedProtocols = [
  { name: "OKX DEX" as const, capability: "Committed aggregator routes with exact-call replay" },
  { name: "Aave V3" as const, capability: "Bounded supply with receipt-token floor" },
  { name: "Curve" as const, capability: "StableSwap NG exact-input exchange" },
  { name: "Uniswap V3" as const, capability: "Exact-input exchange with verified pool identity" },
  { name: "Pendle" as const, capability: "Read-only USDG PT market discovery" },
] as const;

export interface DiscoverChallenge { id: string; title: string; goal: string; availability: "live" | "between-rounds" }
export interface DiscoverIntent { id: string; goal: string; state: string; closesAt: string }
export interface DiscoverHistory { id: string; goal: string; solver: string; state: string; protocols: string[] }
export type DiscoverSection = "challenges" | "intents" | "history" | "commerce";

function label(value: string) {
  const words = value.replaceAll("-", " ");
  return words[0]?.toUpperCase() + words.slice(1);
}

function formatDeadline(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  });
}

function HistoryRows({ items }: { items: DiscoverHistory[] }) {
  return <ul className={styles.historyList}>{items.map((item) => <li key={item.id}>
    <Link href={`/programs/${item.id}`}>
      <span className={styles.historyGoal}>{item.goal}</span>
      <span className={styles.historyRoute}>{item.protocols.map((protocol, index) => <span key={protocol}>
        {index > 0 ? <ArrowRight aria-hidden="true" className={styles.routeArrow} size={11} /> : null}
        <ProtocolMark protocol={protocol} size={22} />
      </span>)}</span>
      <small>{item.solver}</small>
      <strong data-state={item.state}>{label(item.state)}</strong>
      <ArrowRight aria-hidden="true" size={15} />
    </Link>
  </li>)}</ul>;
}

function OpenCompetitions({ intents, error }: { intents: DiscoverIntent[]; error?: string }) {
  const visible = intents.slice(0, 3);
  const more = intents.slice(3);
  return <section aria-labelledby="open-title" className={styles.railSection}>
    <header className={styles.sectionHeader}>
      <div><h2 id="open-title">Solver competitions</h2></div>
      <Clock3 aria-hidden="true" size={20} />
    </header>
    {error ? <p className={styles.empty} role="status">{error}</p> : visible.length ? <>
      <ul className={styles.actionList}>{visible.map((item) => <li key={item.id}>
        <Link href={`/intents/${item.id}`}>
          <span className={styles.liveLabel}>Collecting</span>
          <strong>{item.goal}</strong>
          <small>Closes {formatDeadline(item.closesAt)} UTC</small>
          <span className={styles.rowAction}>View competition <ArrowRight aria-hidden="true" size={14} /></span>
        </Link>
      </li>)}</ul>
      {more.length ? <details className={styles.more}><summary>Show {more.length} more open {more.length === 1 ? "competition" : "competitions"}</summary>
        <ul className={styles.actionList}>{more.map((item) => <li key={item.id}><Link href={`/intents/${item.id}`}>
          <strong>{item.goal}</strong><small>Closes {formatDeadline(item.closesAt)} UTC</small>
          <span className={styles.rowAction}>View competition <ArrowRight aria-hidden="true" size={14} /></span>
        </Link></li>)}</ul>
      </details> : null}
    </> : <div className={styles.empty}>
      <strong>No open competitions</strong>
      <span>Start one when you have an outcome for solvers to work on.</span>
      <Link href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={14} /></Link>
    </div>}
  </section>;
}

function ChallengeStarts({ challenges, error }: { challenges: DiscoverChallenge[]; error?: string }) {
  return <section aria-labelledby="starts-title" className={styles.railSection}>
    <header className={styles.sectionHeader}>
      <div><h2 id="starts-title">Ready-made starts</h2></div>
      <Repeat2 aria-hidden="true" size={20} />
    </header>
    <p className={styles.sectionIntro}>Choosing one opens a fresh, bounded round. No solver work runs while it sits here.</p>
    {error ? <p className={styles.empty} role="status">{error}</p> : challenges.length ? <ul className={styles.actionList}>
      {challenges.map((item) => <li key={item.id}><Link href={`/intents/new?challenge=${item.id}`}>
        {item.availability === "live" ? <span className={styles.liveLabel}>Round live</span> : null}
        <strong>{item.title}</strong><small>{item.goal}</small>
        <span className={styles.rowAction}>Start a round <ArrowRight aria-hidden="true" size={14} /></span>
      </Link></li>)}
    </ul> : <div className={styles.empty}>
      <strong>No ready-made starts yet</strong>
      <span>Create a custom intent to open a bounded solver competition.</span>
      <Link href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={14} /></Link>
    </div>}
  </section>;
}

export function DiscoverView({
  challenges, intents, history, commerceOffers, observedAtSec, commerceSourceErrors, sectionErrors,
}: {
  challenges: DiscoverChallenge[];
  intents: DiscoverIntent[];
  history: DiscoverHistory[];
  commerceOffers: CommerceOfferV1[];
  observedAtSec: number;
  commerceSourceErrors?: Array<{ sourceId: string; code: string }>;
  sectionErrors?: Partial<Record<DiscoverSection, string>>;
}) {
  const visibleHistory = history.slice(0, 6);
  const olderHistory = history.slice(6);
  return <div className={styles.view}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1>Find a starting point.<br />See what worked.</h1>
        <p>Open a bounded solver competition from a ready-made goal, or inspect the programs Cobia has already verified.</p>
        <div className={styles.heroActions}>
          <Link className="button button--primary" href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={16} /></Link>
          <a className="text-link" href="#verified-programs">Browse verified programs</a>
        </div>
      </div>
      <dl aria-label="Discover overview" className={styles.overview}>
        <div><dd>{intents.length}</dd><dt>Open now</dt></div>
        <div><dd>{challenges.length}</dd><dt>Ready-made starts</dt></div>
        <div><dd>{history.length}</dd><dt>Recent programs</dt></div>
      </dl>
    </header>

    <div className={styles.primaryGrid}>
      <section aria-labelledby="history-title" className={styles.history} id="verified-programs">
        <header className={styles.sectionHeader}>
          <div><h2 id="history-title">Verified programs</h2>
            <p>Completed solver programs stay inspectable as evidence. They are not live quotes.</p></div>
          <History aria-hidden="true" size={20} />
        </header>
        {sectionErrors?.history ? <p className={styles.empty} role="status">{sectionErrors.history}</p> : history.length ? <>
          <HistoryRows items={visibleHistory} />
          {olderHistory.length ? <details className={styles.more}><summary>Show {olderHistory.length} older {olderHistory.length === 1 ? "program" : "programs"}</summary>
            <HistoryRows items={olderHistory} />
          </details> : null}
        </> : <div className={styles.empty}><strong>No verified programs yet</strong>
          <span>Programs appear here after a solver proposal is checked and resolved.</span></div>}
      </section>
      <aside aria-label="Start or join a solver competition" className={styles.rail}>
        <OpenCompetitions intents={intents} error={sectionErrors?.intents} />
        <ChallengeStarts challenges={challenges} error={sectionErrors?.challenges} />
      </aside>
    </div>

    <section aria-labelledby="protocols-title" className={styles.protocols}>
      <header className={styles.sectionHeader}><div><h2 id="protocols-title">What solvers can use</h2>
        <p>Supported protocols and the exact evidence Cobia verifies on X Layer.</p></div></header>
      <ul>{supportedProtocols.map((protocol) => <li key={protocol.name}>
        <ProtocolMark decorative protocol={protocol.name} size={30} />
        <span className={styles.protocolCopy}><strong>{protocol.name}</strong><small>{protocol.capability}</small></span>
      </li>)}</ul>
    </section>

    <section aria-labelledby="commerce-title" className={styles.commerce}>
      <header className={styles.sectionHeader}><div><h2 id="commerce-title">Paid resources</h2>
        <p>Inspect supported services and payment evidence. External x402 listings remain details-only.</p></div>
        <ShoppingBag aria-hidden="true" size={20} />
      </header>
      <OkxAgentPaymentLookup headingLevel={3} />
      {sectionErrors?.commerce
        ? <p className={styles.empty} role="status">{sectionErrors.commerce}</p>
        : <CommerceOffers offers={commerceOffers} observedAtSec={observedAtSec} sourceErrors={commerceSourceErrors} />}
    </section>
  </div>;
}
