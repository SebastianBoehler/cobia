import { CircleDot } from "lucide-react";
import Link from "next/link";
import { CobiaLogo } from "../brand/CobiaLogo";
import { WalletButton } from "../wallet/WalletButton";

export function AppHeader() {
  return (
    <header className="app-header">
      <CobiaLogo />
      <nav className="app-header__nav" aria-label="Primary navigation">
        <Link href="/requests/new">New request</Link>
        <a href="#mechanism">How it works</a>
        <span className="network-label">
          <CircleDot aria-hidden="true" size={14} /> X Layer · build mode
        </span>
      </nav>
      <WalletButton />
    </header>
  );
}
