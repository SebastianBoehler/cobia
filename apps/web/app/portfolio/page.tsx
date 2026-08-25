import { AppHeader } from "@/components/layout/AppHeader";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import styles from "@/components/product/ProductShell.module.css";
import { getSiteNetwork } from "@/lib/network/site-network-server";
import { createPageMetadata } from "../site-metadata";

export async function generateMetadata() {
  const network = await getSiteNetwork();
  return createPageMetadata({
    title: network.mode === "testnet" ? "Testnet wallet" : "Portfolio",
    description: network.mode === "testnet"
      ? "Read a wallet's native OKB balance directly from X Layer testnet chain 1952."
      : "Review X Layer balances, protocol positions, indexed PnL, and recent DEX activity.",
    path: "/portfolio",
    index: false,
  });
}

export default async function PortfolioPage() {
  const testnet = (await getSiteNetwork()).mode === "testnet";
  return <><AppHeader /><main className={styles.page} id="main-content"><header className={styles.heading}><h1>{testnet ? "Testnet wallet" : "Portfolio"}</h1><p>{testnet ? "Native OKB read directly from X Layer testnet at one explicit block. No protocol assets are assumed on this rehearsal deployment." : "Your X Layer portfolio, all in one place."}</p></header><PortfolioView /></main></>;
}
