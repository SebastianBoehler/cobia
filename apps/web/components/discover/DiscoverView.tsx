import type { CommerceOfferV1 } from "@cobia/domain";
import { ArrowRight, Clock3, History, Repeat2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { CommerceOffers } from "./CommerceOffers";

export interface DiscoverChallenge { id: string; title: string; goal: string; availability: "live" | "between-rounds" }
export interface DiscoverIntent { id: string; goal: string; state: string; closesAt: string }
export interface DiscoverHistory { id: string; goal: string; solver: string; state: string }

function label(value: string) {
  const words = value.replaceAll("-", " ");
  return words[0]?.toUpperCase() + words.slice(1);
}

export function DiscoverView({
  challenges, intents, history, commerceOffers, observedAtSec, commerceSourceErrors,
}: {
  challenges: DiscoverChallenge[];
  intents: DiscoverIntent[];
  history: DiscoverHistory[];
  commerceOffers: CommerceOfferV1[];
  observedAtSec: number;
  commerceSourceErrors?: Array<{ sourceId: string; code: string }>;
}) {
  return (
    <div className="discover-view">
      <section aria-labelledby="commerce-title">
        <header><div><h2 id="commerce-title">Products and paid resources</h2><p>Public x402 and UCP offers. Discovery is open; execution stays verifier-gated.</p></div><ShoppingBag aria-hidden="true" size={22} /></header>
        <CommerceOffers offers={commerceOffers} observedAtSec={observedAtSec} sourceErrors={commerceSourceErrors} />
      </section>

      <section aria-labelledby="standing-title">
        <header><div><h2 id="standing-title">Standing challenges</h2><p>Persistent goals with independently bounded competition rounds.</p></div><Repeat2 aria-hidden="true" size={22} /></header>
        {challenges.length ? <div className="discover-list">{challenges.map((item) => <article key={item.id}>
          <div><span className={`status ${item.availability === "live" ? "status--live" : ""}`}>{label(item.availability)}</span><h3>{item.title}</h3><p>{item.goal}</p></div>
          <Link href={`/intents/new?challenge=${item.id}`}>Use this challenge <ArrowRight aria-hidden="true" size={15} /></Link>
        </article>)}</div> : <p className="empty-state">No standing challenges are published yet.</p>}
      </section>

      <section aria-labelledby="custom-title">
        <header><div><h2 id="custom-title">Custom intents</h2><p>Wallet-specific signed policies currently collecting solver revisions.</p></div><Clock3 aria-hidden="true" size={22} /></header>
        {intents.length ? <div className="discover-list">{intents.map((item) => <article key={item.id}>
          <div><span className="status status--live">Collecting</span><h3>{item.goal}</h3><p>Closes {new Date(item.closesAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p></div>
          <Link href={`/intents/${item.id}`}>View competition <ArrowRight aria-hidden="true" size={15} /></Link>
        </article>)}</div> : <p className="empty-state">No custom intents are collecting proposals.</p>}
      </section>

      <section aria-labelledby="history-title">
        <header><div><h2 id="history-title">Past discoveries</h2><p>Historical programs remain inspectable but are never presented as current quotes.</p></div><History aria-hidden="true" size={22} /></header>
        {history.length ? <div className="history-table">{history.map((item) => <Link href={`/programs/${item.id}`} key={item.id}>
          <span>{item.goal}</span><small>{item.solver}</small><strong>{label(item.state)}</strong><ArrowRight aria-hidden="true" size={15} />
        </Link>)}</div> : <p className="empty-state">No past discoveries yet.</p>}
      </section>
    </div>
  );
}
