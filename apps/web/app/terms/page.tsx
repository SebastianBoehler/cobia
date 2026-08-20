import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";
import styles from "./TermsPage.module.css";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description: "Terms for Cobia's non-custodial intent, verification, payment, and execution service.",
  path: "/terms",
});

export default function TermsPage() {
  return <>
    <AppHeader />
    <main className={styles.page} id="main-content">
      <header>
        <h1>Terms of use</h1>
        <p>Effective August 20, 2026</p>
      </header>
      <section>
        <h2>What Cobia provides</h2>
        <p>
          Cobia searches, compares, verifies, and simulates non-custodial routes on X Layer and
          explicitly identified payment or asset networks.
          A quote, forecast, APY, fee estimate, or simulation is information—not a guarantee of
          future performance or investment advice.
        </p>
      </section>
      <section>
        <h2>Your transactions</h2>
        <p>
          You remain in control of your wallet. Mainnet approvals and transactions use real assets
          and are submitted only after your wallet confirmation. You are responsible for reviewing
          the asset, amount, recipient, minimum output, gas, deadline, and contract calls before signing.
        </p>
      </section>
      <section>
        <h2>Bounds and market risk</h2>
        <p>
          Cobia verifies encoded route bounds and reports which values are enforced on-chain. Estimates
          can change with liquidity, fees, oracle data, interest rates, MEV, reorgs, smart-contract risk,
          depegs, and network conditions. Do not transact unless you can bear a total loss.
        </p>
      </section>
      <section>
        <h2>Payments and third parties</h2>
        <p>
          Route-reveal payments and protocol interactions use third-party wallets, networks, and smart
          contracts. Their own terms may apply. Cobia does not custody funds, reverse confirmed blockchain
          transactions, or control third-party availability. Payment settlement proves payment,
          not the quality, accuracy, legality, or continued availability of a purchased service.
        </p>
      </section>
      <section>
        <h2>Tokenized assets</h2>
        <p>
          A registered token identity does not make an asset suitable or legally available to you.
          Issuer eligibility, transfer, custody, redemption, sanctions, tax, and jurisdictional rules
          still apply. Any eligibility acknowledgement is your attestation, not legal approval by Cobia.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          You may not use Cobia to violate law, evade sanctions, exploit systems, misrepresent identity,
          or interfere with other users. Access may be limited while security or integrity issues are reviewed.
        </p>
      </section>
      <section>
        <h2>Beta service</h2>
        <p>
          Cobia is beta software provided as available, without warranties. To the extent permitted by law,
          Cobia is not liable for indirect losses, lost profits, protocol failures, or transactions you approve.
        </p>
      </section>
      <p className={styles.back}><Link href="/intents/new">← Back to new intent</Link></p>
    </main>
  </>;
}
