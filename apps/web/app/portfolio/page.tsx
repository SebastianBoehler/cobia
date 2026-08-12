import { AppHeader } from "@/components/layout/AppHeader";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import styles from "@/components/product/ProductShell.module.css";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Positions",
  description: "Review wallet balances and direct X Layer protocol positions observed at explicit blocks.",
  path: "/portfolio",
  index: false,
});

export default function PortfolioPage() {
  return <><AppHeader /><main className={styles.page}><header className={styles.heading}><h1>Positions</h1><p>Your available X Layer balances and direct protocol positions, read together at one explicit block.</p></header><PortfolioView /></main></>;
}
