import type { CommerceOfferV1 } from "@cobia/domain";
import styles from "./CommerceOfferDetails.module.css";
import { humanizeIdentifier, networkName, paymentDisplay, productName } from "./offer-display";

function label(value: string) {
  return humanizeIdentifier(value);
}

export function CommerceOfferDetails({ offer, observedAtSec }: {
  offer: CommerceOfferV1;
  observedAtSec: number;
}) {
  const expired = observedAtSec >= offer.expiresAt;
  const executable = offer.eligibility.status === "executable" && !expired;
  const blockedReason = expired ? "Offer expired" : offer.eligibility.status === "executable"
    ? null : label(offer.eligibility.blockedReason);
  return <article className={styles.view}>
    <header className={styles.hero}>
      <span className={styles.status}>{executable ? "Cobia-supported" : "External details only"} · {offer.source.protocol}</span>
      <h1>{productName(offer)}</h1>
      <p>{offer.product.description ?? `Sold by ${offer.merchant.displayName}. Product details were not supplied by the source.`}</p>
    </header>
    <div className={styles.grid}>
      <section className={styles.card}>
        <h2>Exact payment</h2>
        <dl>
          <div><dt>Price</dt><dd>{paymentDisplay(offer)}</dd></div>
          <div><dt>Asset</dt><dd>{offer.payment.asset}</dd></div>
          <div><dt>Merchant</dt><dd>{offer.merchant.displayName} · {offer.merchant.id}</dd></div>
          <div><dt>Payee</dt><dd>{offer.merchant.payee}</dd></div>
          <div><dt>Network</dt><dd>{networkName(offer.payment.chainId)} · {offer.payment.chainId}</dd></div>
          <div><dt>Quantity</dt><dd>{offer.product.quantity}</dd></div>
          {offer.product.mimeType ? <div><dt>Delivery</dt><dd>{offer.product.mimeType}</dd></div> : null}
          {offer.placement.kind !== "direct-contract" ? <div><dt>Resource endpoint</dt><dd>{offer.placement.endpoint}</dd></div> : null}
        </dl>
      </section>
      <section className={styles.card}>
        <h2>Evidence boundary</h2>
        <dl>
          <div><dt>Profile</dt><dd>{label(offer.evidence.profile)}</dd></div>
          <div><dt>Expires</dt><dd>{new Date(offer.expiresAt * 1_000).toISOString()}</dd></div>
          <div><dt>Source</dt><dd>{new URL(offer.source.url).hostname}</dd></div>
          <div><dt>Status</dt><dd className={blockedReason ? styles.blocked : undefined}>{blockedReason ?? "Verified merchant"}</dd></div>
        </dl>
        <p className={styles.notice}>Payment settled is not proof of delivery. An order is shown as issued only when the configured onchain receipt independently verifies.</p>
      </section>
    </div>
  </article>;
}
