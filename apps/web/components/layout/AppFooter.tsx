import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CobiaLogo } from "../brand/CobiaLogo";

const productLinks = [
  { href: "/intents/new", label: "Create an intent" },
  { href: "/discover", label: "Discover" },
  { href: "/portfolio", label: "Portfolio" },
] as const;

const resourceLinks = [
  { href: "/docs/quickstart", label: "Build a solver" },
  { href: "/docs", label: "Developer docs" },
  { href: "/solvers", label: "Solver directory" },
  { href: "/media", label: "Media kit" },
] as const;

export function AppFooter({ targetChainId }: { targetChainId: 196 | 1952 }) {
  return (
    <footer className="app-footer">
      <div className="app-footer__intro">
        <CobiaLogo />
        <p>Solvers compete on outcomes. The verifier checks the complete program. Your wallet keeps execution authority.</p>
      </div>
      <nav aria-label="Product">
        <strong>Product</strong>
        {productLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <nav aria-label="Resources">
        <strong>Resources</strong>
        {resourceLinks.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <div className="app-footer__meta">
        <span>{targetChainId === 1952 ? "X Layer testnet · chain 1952" : "X Layer · chain 196"}</span>
        <Link href="/terms">Terms</Link>
        <a href="https://x.com/Cobia_Web3" rel="noreferrer" target="_blank">
          @Cobia_Web3 <ArrowUpRight aria-hidden="true" size={13} />
        </a>
      </div>
    </footer>
  );
}
