import { ArrowRight, Clock3, Compass, WalletCards } from "lucide-react";
import Link from "next/link";
import { DomainCapabilityGrid } from "../components/home/DomainCapabilityGrid";
import { GeneralIntentHero } from "../components/home/GeneralIntentHero";
import { TrustBoundary } from "../components/home/TrustBoundary";
import { AppHeader } from "@/components/layout/AppHeader";
import { TestnetHome } from "@/components/network/TestnetHome";
import { getSiteNetwork } from "@/lib/network/site-network-server";
import { createPageMetadata } from "./site-metadata";

export async function generateMetadata() {
  const network = await getSiteNetwork();
  return createPageMetadata(network.mode === "testnet" ? {
    title: "X Layer Testnet Rehearsal",
    description: "Inspect Cobia's paused X Layer testnet deployment and dedicated-wallet state on chain 1952.",
    path: "/",
    index: false,
  } : {
    title: "Verified onchain intents",
    description: "Describe an onchain outcome, let solvers compete, and review only independently verified programs.",
    path: "/",
  });
}

const productLinks = [
  { href: "/portfolio", icon: WalletCards, title: "Portfolio", description: "See wallet balances and Aave positions from one fresh X Layer snapshot." },
  { href: "/activity", icon: Clock3, title: "Activity", description: "Follow each intent from your request to a confirmed transaction." },
  { href: "/discover", icon: Compass, title: "Standing challenges", description: "Reuse supported goals or explore what solvers have already found." },
] as const;

export default async function Home() {
  if ((await getSiteNetwork()).mode === "testnet") return <TestnetHome />;
  return (
    <>
      <AppHeader />
      <main className="home" id="main-content">
        <GeneralIntentHero />
        <section className="buildx-callout" aria-labelledby="buildx-callout-title">
          <div>
            <h2 id="buildx-callout-title">Built for AI Season. Working on X Layer mainnet.</h2>
            <p>Watch a complete intent become a verified result, then inspect the transactions, receipts, and source behind every claim.</p>
          </div>
          <Link className="button button--paper" href="/buildx">
            Watch demo and proof <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
        <nav className="product-strip" aria-label="Cobia product">
          {productLinks.map(({ href, icon: Icon, title, description }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" size={20} />
              <span><strong>{title}</strong><small>{description}</small></span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          ))}
        </nav>
        <DomainCapabilityGrid />
        <TrustBoundary />
      </main>
    </>
  );
}
