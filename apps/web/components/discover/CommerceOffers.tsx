import { commerceOfferCommitmentV1, type CommerceOfferV1 } from "@cobia/domain";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

function label(value: string) {
  const words = value.replaceAll("-", " ").replaceAll("_", " ");
  return words[0]?.toUpperCase() + words.slice(1).toLowerCase();
}

function evidenceLabel(profile: CommerceOfferV1["evidence"]["profile"]) {
  return profile === "onchain-order" ? "Onchain order evidence" : "Payment settlement evidence";
}

function networkLabel(chainId: number) {
  if (chainId === 196) return "X Layer";
  if (chainId === 8453) return "Base";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

function CommerceOfferCard({ offer, observedAtSec }: { offer: CommerceOfferV1; observedAtSec: number }) {
  const commitment = commerceOfferCommitmentV1(offer);
  const executable = offer.eligibility.status === "executable";
  const secondsLeft = Math.max(0, offer.expiresAt - observedAtSec);
  return <article>
    <div className="commerce-offers__heading">
      <span className={`status ${executable ? "status--live" : ""}`}>
        {label(offer.eligibility.status)}
      </span>
      <span>{offer.source.protocol === "x402-v2" ? "x402" : "UCP Catalog"}</span>
    </div>
    <h3>{offer.product.id}</h3>
    <p>{offer.merchant.displayName}</p>
    <dl>
      <div><dt>Price</dt><dd>{offer.payment.atomicAmount} atomic</dd></div>
      <div><dt>Network</dt><dd>{networkLabel(offer.payment.chainId)} · chain {offer.payment.chainId}</dd></div>
      <div><dt>Evidence</dt><dd>{evidenceLabel(offer.evidence.profile)}</dd></div>
      <div><dt>Freshness</dt><dd>Expires in {secondsLeft}s</dd></div>
      <div><dt>Source</dt><dd>{new URL(offer.source.url).hostname}</dd></div>
    </dl>
    {offer.eligibility.status !== "executable" && <p className="commerce-offers__reason">
      {label(offer.eligibility.blockedReason)}
    </p>}
    <Link href={`/commerce/offers/${commitment}`}>
      Review offer <ArrowRight aria-hidden="true" size={15} />
    </Link>
  </article>;
}

export function CommerceOffers({ offers, observedAtSec, sourceErrors = [] }: {
  offers: CommerceOfferV1[];
  observedAtSec: number;
  sourceErrors?: Array<{ sourceId: string; code: string }>;
}) {
  if (!offers.length) {
    return <div>
      <p className="empty-state">No commerce offers are currently indexed.</p>
      {sourceErrors.map((error) => <p className="source-error" key={`${error.sourceId}:${error.code}`} role="status">
        {error.sourceId}: {label(error.code)}
      </p>)}
    </div>;
  }

  const visibleOffers = offers.slice(0, 6);
  const moreOffers = offers.slice(6);
  return <div className="commerce-offers-shell">
    <div className="commerce-offers">
      {visibleOffers.map((offer) => <CommerceOfferCard
        key={commerceOfferCommitmentV1(offer)} offer={offer} observedAtSec={observedAtSec}
      />)}
    </div>
    {moreOffers.length ? <details className="commerce-offers__more">
      <summary>Show {moreOffers.length} more {moreOffers.length === 1 ? "offer" : "offers"}</summary>
      <div className="commerce-offers commerce-offers--more">
        {moreOffers.map((offer) => <CommerceOfferCard
          key={commerceOfferCommitmentV1(offer)} offer={offer} observedAtSec={observedAtSec}
        />)}
      </div>
    </details> : null}
    {sourceErrors.map((error) => <p className="source-error" key={`${error.sourceId}:${error.code}`} role="status">
      {error.sourceId}: {label(error.code)}
    </p>)}
  </div>;
}
