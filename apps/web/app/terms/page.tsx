import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description: "Terms for Cobia's non-custodial X Layer route search, verification, simulation, reveal, and execution service.",
  path: "/terms",
});

export default function TermsPage() {
  return <>
    <AppHeader />
    <main className="legal-page">
      <header>
        <h1>Terms of use</h1>
        <p>Effective August 12, 2026</p>
      </header>
      <section>
        <h2>What Cobia provides</h2>
        <p>
          Cobia searches, compares, verifies, and simulates non-custodial routes on X Layer.
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
          transactions, or control third-party availability.
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
      <p className="legal-page__back"><Link href="/requests/new">← Back to new intent</Link></p>
    </main>
  </>;
}
