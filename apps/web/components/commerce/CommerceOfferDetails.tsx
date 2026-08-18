import type { CommerceOfferV1 } from "@cobia/domain";
import styles from "./CommerceOfferDetails.module.css";

function label(value: string) {
  const words = value.replaceAll("-", " ").replaceAll("_", " ");
  return words[0]?.toUpperCase() + words.slice(1).toLowerCase();
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
      <span className={styles.status}>{executable ? "Executable" : "Discovery only"} · {offer.source.protocol}</span>
      <h1>{offer.product.id}</h1>
      <p>{offer.merchant.displayName}. Review the immutable product, payment, and evidence bounds before creating a commerce intent.</p>
    </header>
    <div className={styles.grid}>
      <section className={styles.card}>
        <h2>Exact payment</h2>
        <dl>
          <div><dt>Amount</dt><dd>{offer.payment.atomicAmount} atomic units</dd></div>
          <div><dt>Asset</dt><dd>{offer.payment.asset}</dd></div>
          <div><dt>Payee</dt><dd>{offer.merchant.payee}</dd></div>
          <div><dt>Network</dt><dd>X Layer · 196</dd></div>
          <div><dt>Quantity</dt><dd>{offer.product.quantity}</dd></div>
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
