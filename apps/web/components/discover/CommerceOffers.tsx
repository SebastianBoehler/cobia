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

  return <div className="commerce-offers">
    {offers.map((offer) => {
      const commitment = commerceOfferCommitmentV1(offer);
      const executable = offer.eligibility.status === "executable";
      const secondsLeft = Math.max(0, offer.expiresAt - observedAtSec);
      return <article key={commitment}>
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
          <div><dt>Network</dt><dd>X Layer · chain {offer.payment.chainId}</dd></div>
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
    })}
    {sourceErrors.map((error) => <p className="source-error" key={`${error.sourceId}:${error.code}`} role="status">
      {error.sourceId}: {label(error.code)}
    </p>)}
  </div>;
}
