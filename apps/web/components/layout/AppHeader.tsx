"use client";

import { CirclePlus, Clock3, Store, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CobiaLogo } from "../brand/CobiaLogo";
import { WalletButton } from "../wallet/WalletButton";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { href: "/requests/new", icon: CirclePlus, label: "New intent", prefixes: ["/requests", "/routes"] },
  { href: "/portfolio", icon: WalletCards, label: "Positions", prefixes: ["/portfolio"] },
  { href: "/activity", icon: Clock3, label: "Activity", prefixes: ["/activity"] },
  { href: "/markets", icon: Store, label: "Solver market", prefixes: ["/markets"] },
] as const;

export function AppHeader() {
  const pathname = usePathname() ?? "";
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-header__brand">
          <CobiaLogo />
          <span className="network-label" title="X Layer Mainnet">
            <span aria-hidden="true" className="network-label__dot" />
            X Layer
          </span>
        </div>
        <nav className="app-header__nav" aria-label="Primary navigation">
          {navigation.map(({ href, icon: Icon, label, prefixes }) => {
            const active = prefixes.some((prefix) => pathname.startsWith(prefix));
            return (
              <Link aria-current={active ? "page" : undefined} href={href} key={href}>
                <Icon aria-hidden="true" className="app-header__nav-icon" size={20} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="app-header__actions"><ThemeToggle /><WalletButton /></div>
      </header>
    </>
  );
}
