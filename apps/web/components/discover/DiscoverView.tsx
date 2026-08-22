import type { CommerceOfferV1 } from "@cobia/domain";
import { ArrowRight, Clock3, History, Repeat2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { CommerceOffers } from "./CommerceOffers";
import { ProtocolMark } from "../brand/ProtocolMark";

const supportedProtocols = [
  { name: "Aave V3" as const, capability: "Bounded supply with receipt-token floor" },
  { name: "Curve" as const, capability: "StableSwap NG exact-input exchange" },
  { name: "Uniswap V3" as const, capability: "Exact-input exchange and verified pool identity" },
  { name: "Pendle" as const, capability: "Read-only USDG PT market discovery" },
] as const;

export interface DiscoverChallenge { id: string; title: string; goal: string; availability: "live" | "between-rounds" }
export interface DiscoverIntent { id: string; goal: string; state: string; closesAt: string }
export interface DiscoverHistory { id: string; goal: string; solver: string; state: string }
export type DiscoverSection = "challenges" | "intents" | "history" | "commerce";

function label(value: string) {
  const words = value.replaceAll("-", " ");
  return words[0]?.toUpperCase() + words.slice(1);
}

function HistoryRows({ items }: { items: DiscoverHistory[] }) {
  return <div className="history-table">{items.map((item) => <Link href={`/programs/${item.id}`} key={item.id}>
    <span>{item.goal}</span><small>{item.solver}</small><strong>{label(item.state)}</strong><ArrowRight aria-hidden="true" size={15} />
  </Link>)}</div>;
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
  const visibleHistory = history.slice(0, 5);
  const olderHistory = history.slice(5);
  return (
    <div className="discover-view">
      <section aria-labelledby="standing-title">
        <header><div><h2 id="standing-title">Standing challenges</h2><p>Supported, reusable goals. Each run opens a fresh, bounded solver competition.</p></div><Repeat2 aria-hidden="true" size={22} /></header>
        {sectionErrors?.challenges ? <p className="empty-state" role="status">{sectionErrors.challenges}</p> : challenges.length ? <div className="discover-list">{challenges.map((item) => <article key={item.id}>
          <div>{item.availability === "live" ? <span className="status status--live">Live round</span> : null}<h3>{item.title}</h3><p>{item.goal}</p></div>
          <Link href={`/intents/new?challenge=${item.id}`}>Use challenge <ArrowRight aria-hidden="true" size={15} /></Link>
        </article>)}</div> : <p className="empty-state">No standing challenges are published yet.</p>}
        <div className="supported-protocols" aria-labelledby="protocols-title">
          <div><h3 id="protocols-title">X Layer protocol coverage</h3><p>Aave, Curve, and Uniswap use pinned semantic adapters. Pendle market discovery is read-only until a fresh wallet transaction verifies independently; other contracts can compete through the exact-call replay lane.</p></div>
          <ul>{supportedProtocols.map((protocol) => <li key={protocol.name}>
            <ProtocolMark protocol={protocol.name} size={28} />
            <span><strong>{protocol.name}</strong><small>{protocol.capability}</small></span>
          </li>)}</ul>
        </div>
      </section>

      <aside aria-label="Intent marketplace" className="discover-view__rail">
        <section aria-labelledby="custom-title">
          <header><div><h2 id="custom-title">Custom intents</h2><p>Wallet-signed requests currently accepting solver proposals.</p></div><Clock3 aria-hidden="true" size={22} /></header>
          {sectionErrors?.intents ? <p className="empty-state" role="status">{sectionErrors.intents}</p> : intents.length ? <div className="discover-list">{intents.map((item) => <article key={item.id}>
            <div><span className="status status--live">Collecting</span><h3>{item.goal}</h3><p>Closes {new Date(item.closesAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p></div>
            <Link href={`/intents/${item.id}`}>View competition <ArrowRight aria-hidden="true" size={15} /></Link>
          </article>)}</div> : <div className="empty-state empty-state--action"><span>No custom intents are collecting proposals.</span><Link href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={15} /></Link></div>}
        </section>
      </aside>

      <section aria-labelledby="history-title" className="discover-view__history">
        <header><div><h2 id="history-title">Past discoveries</h2><p>Completed and expired programs remain evidence, never current quotes.</p></div><History aria-hidden="true" size={22} /></header>
        {sectionErrors?.history ? <p className="empty-state" role="status">{sectionErrors.history}</p> : history.length ? <>
          <HistoryRows items={visibleHistory} />
          {olderHistory.length ? <details className="history-more"><summary>Show {olderHistory.length} older discoveries</summary><HistoryRows items={olderHistory} /></details> : null}
        </> : <p className="empty-state">Verified solver history will appear here after a program resolves.</p>}
      </section>

      <section aria-labelledby="commerce-title" className="discover-view__commerce">
        <header><div><h2 id="commerce-title">Paid resources</h2><p>Review supported services across the full marketplace. Verified purchases lead; external x402 listings remain details-only.</p></div><ShoppingBag aria-hidden="true" size={22} /></header>
        {sectionErrors?.commerce
          ? <p className="empty-state" role="status">{sectionErrors.commerce}</p>
          : <CommerceOffers offers={commerceOffers} observedAtSec={observedAtSec} sourceErrors={commerceSourceErrors} />}
      </section>
    </div>
  );
}
