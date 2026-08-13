"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CobiaLogo } from "../brand/CobiaLogo";
import { WalletButton } from "../wallet/WalletButton";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { href: "/requests/new", label: "New intent", prefixes: ["/requests", "/routes"] },
  { href: "/portfolio", label: "Positions", prefixes: ["/portfolio"] },
  { href: "/activity", label: "Activity", prefixes: ["/activity"] },
  { href: "/markets", label: "Solver market", prefixes: ["/markets"] },
] as const;

export function AppHeader() {
  const pathname = usePathname() ?? "";
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <CobiaLogo />
        <span className="network-label" title="X Layer Mainnet">
          <span aria-hidden="true" className="network-label__dot" />
          X Layer
        </span>
      </div>
      <nav className="app-header__nav" aria-label="Primary navigation">
        {navigation.map(({ href, label, prefixes }) => {
          const active = prefixes.some((prefix) => pathname.startsWith(prefix));
          return <Link aria-current={active ? "page" : undefined} href={href} key={href}>{label}</Link>;
        })}
      </nav>
      <div className="app-header__actions"><ThemeToggle /><WalletButton /></div>
    </header>
  );
}
