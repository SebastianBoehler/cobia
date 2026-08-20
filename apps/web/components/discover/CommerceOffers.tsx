import { commerceOfferCommitmentV1, type CommerceOfferV1 } from "@cobia/domain";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { humanizeIdentifier, networkName, paymentDisplay, productName } from "../commerce/offer-display";

function label(value: string) {
  return humanizeIdentifier(value);
}

function evidenceLabel(profile: CommerceOfferV1["evidence"]["profile"]) {
  return profile === "onchain-order" ? "Onchain order evidence" : "Payment settlement evidence";
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
    <h3>{productName(offer)}</h3>
    <p>{offer.product.description ?? `Sold by ${offer.merchant.displayName}`}</p>
    <dl>
      <div><dt>Merchant</dt><dd>{offer.merchant.displayName}</dd></div>
      <div><dt>Price</dt><dd>{paymentDisplay(offer)}</dd></div>
      <div><dt>Network</dt><dd>{networkName(offer.payment.chainId)} · chain {offer.payment.chainId}</dd></div>
      <div><dt>Evidence</dt><dd>{evidenceLabel(offer.evidence.profile)}</dd></div>
      <div><dt>Freshness</dt><dd>Expires in {secondsLeft}s</dd></div>
      <div><dt>Source</dt><dd>{new URL(offer.source.url).hostname}</dd></div>
    </dl>
    {offer.eligibility.status !== "executable" && <p className="commerce-offers__reason">
      {label(offer.eligibility.blockedReason)}
    </p>}
    <Link href={`/commerce/offers/${commitment}`}>
      {executable ? "Review offer" : "View details"} <ArrowRight aria-hidden="true" size={15} />
    </Link>
  </article>;
}

function uniqueExternalX402Offers(offers: CommerceOfferV1[]) {
  const byEndpoint = new Map<string, CommerceOfferV1>();
  for (const offer of offers) {
    if (offer.eligibility.status === "executable" || offer.placement.kind !== "x402-exact") continue;
    if (!byEndpoint.has(offer.placement.endpoint)) byEndpoint.set(offer.placement.endpoint, offer);
  }
  return [...byEndpoint.values()].slice(0, 3);
}

export function CommerceOffers({ offers, observedAtSec, sourceErrors = [] }: {
  offers: CommerceOfferV1[];
  observedAtSec: number;
  sourceErrors?: Array<{ sourceId: string; code: string }>;
}) {
  const supportedOffers = offers.filter((offer) => offer.eligibility.status === "executable");
  const externalOffers = uniqueExternalX402Offers(offers);
  const visibleOffers = supportedOffers.slice(0, 6);
  const moreOffers = supportedOffers.slice(6);
  return <div className="commerce-offers-shell">
    {supportedOffers.length ? <>
      <div className="commerce-offers commerce-offers--supported">
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
    </> : <p className="empty-state">No supported paid resources are available yet.</p>}
    {externalOffers.length ? <div className="commerce-offers__external">
      <header>
        <h3>External x402 index</h3>
        <p>Details only. These listings are not executable in Cobia.</p>
      </header>
      <div className="commerce-offers">
        {externalOffers.map((offer) => <CommerceOfferCard
          key={commerceOfferCommitmentV1(offer)} offer={offer} observedAtSec={observedAtSec}
        />)}
      </div>
    </div> : null}
    {sourceErrors.map((error) => <p className="source-error" key={`${error.sourceId}:${error.code}`} role="status">
      {error.sourceId}: {label(error.code)}
    </p>)}
  </div>;
}
