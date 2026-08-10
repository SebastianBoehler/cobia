import { CircleDot } from "lucide-react";
import Link from "next/link";
import { CobiaLogo } from "../brand/CobiaLogo";
import { WalletButton } from "../wallet/WalletButton";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  return (
    <header className="app-header">
      <CobiaLogo />
      <nav className="app-header__nav" aria-label="Primary navigation">
        <Link href="/markets">Explore</Link>
        <Link href="/portfolio">Portfolio</Link>
        <Link href="/activity">Activity</Link>
        <Link href="/requests/new">Custom</Link>
        <span className="network-label">
          <CircleDot aria-hidden="true" size={14} /> X Layer
        </span>
      </nav>
      <div className="app-header__actions"><ThemeToggle /><WalletButton /></div>
    </header>
  );
}
